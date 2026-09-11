import type { Context, MiddlewareHandler } from "hono";
import { bearerChallenge, TOKEN_EXPIRED_DESCRIPTION, type Logger } from "@sandbox/shared";
import { hasPermission, type Permission } from "../permissions.ts";
import type { IdentityTenant, IdentityUser } from "../ports/identity-reader.ts";
import type { TenantContext } from "../ports/project-repository.ts";
import {
  resolveTenantContext,
  type ResolveTenantContextDeps,
  type TenantContextError,
} from "../usecases/resolve-tenant-context.ts";

/**
 * 認可済みリクエストの変数。
 */
export type ApiVariables = {
  user: IdentityUser;
  tenant: IdentityTenant;
  tenantContext: TenantContext;
};

export type ApiEnv = { Variables: ApiVariables };

export type AuthMiddlewareOptions = ResolveTenantContextDeps & { readonly logger: Logger };

function unauthorized(c: Context, error: string, description?: string): Response {
  c.header("WWW-Authenticate", bearerChallenge(error, description));
  return c.json({ error }, 401);
}

function forbidden(c: Context): Response {
  return c.json({ error: "forbidden" }, 403);
}

function respond(c: Context, logger: Logger, error: TenantContextError): Response {
  switch (error.kind) {
    case "unknown_host":
      return c.json({ error: "not_found" }, 404);
    case "missing_token":
      return unauthorized(c, "invalid_request");
    case "expired":
      return unauthorized(c, "invalid_token", TOKEN_EXPIRED_DESCRIPTION);
    case "invalid_token":
      logger.warn("access token rejected", { reason: error.reason });
      return unauthorized(c, "invalid_token");
    case "jwks_unavailable":
      logger.error("jwks unavailable", { reason: error.reason });
      return c.json({ error: "temporarily_unavailable" }, 503);
    case "user_inactive":
      logger.warn("user inactive or missing");
      return unauthorized(c, "invalid_token");
    case "tenant_inactive":
    case "membership_missing":
      logger.info("tenant access denied", { reason: error.kind });
      return forbidden(c);
  }
}

/**
 * Token 検証から TenantContext の確定までを usecase に委ね、ここでは HTTP への写像だけを行う。
 */
export function authenticate(options: AuthMiddlewareOptions): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const resolved = await resolveTenantContext(options, {
      host: c.req.header("host") ?? new URL(c.req.url).host,
      authorization: c.req.header("Authorization"),
    });
    if (!resolved.ok) return respond(c, options.logger, resolved.error);
    c.set("user", resolved.value.user);
    c.set("tenant", resolved.value.tenant);
    c.set("tenantContext", resolved.value.tenantContext);
    await next();
  };
}

/**
 * Role / Permission → Authorization。エンドポイントごとに要求 permission を宣言する。
 */
export function requirePermission(permission: Permission): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const ctx = c.get("tenantContext");
    if (ctx === undefined) return unauthorized(c, "invalid_request");
    if (!hasPermission(ctx.role, permission)) return forbidden(c);
    await next();
  };
}
