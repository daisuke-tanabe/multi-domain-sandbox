import {
  err,
  ok,
  readBearerToken,
  type Clock,
  type JwksSource,
  type Result,
} from "@sandbox/shared";
import { verifyAccessToken } from "../auth/access-token.ts";
import type { IdentityReader, IdentityTenant, IdentityUser } from "../ports/identity-reader.ts";
import type { TenantContext } from "../ports/project-repository.ts";

export interface ResolveTenantContextDeps {
  readonly issuer: string;
  readonly audience: string;
  readonly jwks: JwksSource;
  readonly identity: IdentityReader;
  readonly clock: Clock;
}

export interface ResolvedTenantContext {
  readonly user: IdentityUser;
  readonly tenant: IdentityTenant;
  readonly tenantContext: TenantContext;
}

export type TenantContextError =
  | { readonly kind: "unknown_host" }
  | { readonly kind: "missing_token" }
  | { readonly kind: "invalid_token"; readonly reason: string }
  | { readonly kind: "expired" }
  | { readonly kind: "jwks_unavailable"; readonly reason: string }
  | { readonly kind: "user_inactive" }
  | { readonly kind: "tenant_inactive" }
  | { readonly kind: "membership_missing" };

/**
 * 1. Host が自分の aud のホストか → 2. Authentication → 3. User Identity → 4. Tenant Membership。
 * docs/design/07-api-auth-design.md の処理順序に対応する。role は Token ではなく tenant_members から毎回取る。
 */
export async function resolveTenantContext(
  deps: ResolveTenantContextDeps,
  input: { readonly host: string; readonly authorization: string | undefined },
): Promise<Result<ResolvedTenantContext, TenantContextError>> {
  // aud はプロセスごとに 1 つ。別サービスのホストで受けたリクエストは存在しない扱いにする
  if (input.host.toLowerCase() !== new URL(deps.audience).host)
    return err({ kind: "unknown_host" });

  const token = readBearerToken(input.authorization);
  if (token === undefined) return err({ kind: "missing_token" });
  const verified = await verifyAccessToken(token, deps);
  if (!verified.ok) return verified;

  const { user, tenant, membership } = await deps.identity.findAccessContext(
    verified.value.userId,
    verified.value.tenantId,
  );
  if (user === undefined || user.status !== "active") return err({ kind: "user_inactive" });
  if (tenant === undefined || tenant.status !== "active") return err({ kind: "tenant_inactive" });
  if (membership === undefined || membership.status !== "active")
    return err({ kind: "membership_missing" });

  return ok({
    user,
    tenant,
    tenantContext: { tenantId: tenant.id, userId: user.id, role: membership.role },
  });
}
