import type { Context, MiddlewareHandler } from "hono";
import type { Clock, Logger } from "@sandbox/shared";
import { hasPermission, type Permission } from "../permissions.ts";
import type { IdentityReader, IdentityTenant, IdentityUser } from "../ports/identity-reader.ts";
import type { JwksSource } from "../ports/jwks-source.ts";
import type { TenantContext } from "../ports/project-repository.ts";
import { verifyAccessToken, type AccessTokenClaims } from "./access-token.ts";

/**
 * 認可済みリクエストの変数。docs/design/07-api-auth-design.md の処理順序に対応する。
 */
export type ApiVariables = {
  claims: AccessTokenClaims;
  user: IdentityUser;
  tenant: IdentityTenant;
  tenantContext: TenantContext;
};

export type ApiEnv = { Variables: ApiVariables };

export interface AuthMiddlewareOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly jwks: JwksSource;
  readonly identity: IdentityReader;
  readonly clock: Clock;
  readonly logger: Logger;
}

function unauthorized(c: Context, error: string, description?: string): Response {
  const challenge =
    description === undefined
      ? `Bearer error="${error}"`
      : `Bearer error="${error}", error_description="${description}"`;
  c.header("WWW-Authenticate", challenge);
  return c.json({ error }, 401);
}

function forbidden(c: Context): Response {
  return c.json({ error: "forbidden" }, 403);
}

/**
 * 1. Authentication → 2. User Identity → 3. Tenant Membership を順に通し、TenantContext を確定する。
 * role は Token ではなく tenant_members から毎回取得する。
 */
export function authenticate(options: AuthMiddlewareOptions): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    if (header === undefined || !header.startsWith("Bearer ")) {
      return unauthorized(c, "invalid_request");
    }
    const verified = await verifyAccessToken(header.slice("Bearer ".length), {
      issuer: options.issuer,
      audience: options.audience,
      jwks: options.jwks,
      clock: options.clock,
    });
    if (!verified.ok) {
      switch (verified.error.kind) {
        case "expired":
          return unauthorized(c, "invalid_token", "expired");
        case "jwks_unavailable":
          options.logger.error("jwks unavailable", { reason: verified.error.reason });
          return c.json({ error: "temporarily_unavailable" }, 503);
        default:
          options.logger.warn("access token rejected", { reason: verified.error.reason });
          return unauthorized(c, "invalid_token");
      }
    }
    const claims = verified.value;

    const [user, tenant, membership] = await Promise.all([
      options.identity.findUserById(claims.userId),
      options.identity.findTenantById(claims.tenantId),
      options.identity.findMembership(claims.tenantId, claims.userId),
    ]);
    if (user === undefined || user.status !== "active") {
      options.logger.warn("user inactive or missing", { userId: claims.userId });
      return unauthorized(c, "invalid_token");
    }
    if (tenant === undefined || tenant.status !== "active") {
      options.logger.info("tenant inactive or missing", { tenantId: claims.tenantId });
      return forbidden(c);
    }
    if (membership === undefined || membership.status !== "active") {
      options.logger.info("membership missing", {
        tenantId: claims.tenantId,
        userId: claims.userId,
      });
      return forbidden(c);
    }

    c.set("claims", claims);
    c.set("user", user);
    c.set("tenant", tenant);
    c.set("tenantContext", { tenantId: tenant.id, userId: user.id, role: membership.role });
    await next();
  };
}

/**
 * 4. Role / Permission → 5. Authorization。エンドポイントごとに要求 permission を宣言する。
 */
export function requirePermission(permission: Permission): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const ctx = c.get("tenantContext");
    if (ctx === undefined) return unauthorized(c, "invalid_request");
    if (!hasPermission(ctx.role, permission)) return forbidden(c);
    await next();
  };
}
