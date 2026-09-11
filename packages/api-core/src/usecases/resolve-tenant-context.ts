import {
  err,
  ok,
  readBearerToken,
  type Clock,
  type JwksSource,
  type Result,
} from "@sandbox/shared";
import { verifyAccessToken } from "../auth/access-token.ts";
import type { MemberRepository, TenantContext } from "../ports/member-repository.ts";
import { resolvePermissions, type ServiceDefinition } from "../service-definition.ts";

export interface ResolveTenantContextDeps {
  readonly issuer: string;
  readonly audience: string;
  readonly jwks: JwksSource;
  readonly definition: ServiceDefinition;
  readonly members: MemberRepository;
  readonly clock: Clock;
}

export type TenantContextError =
  | { readonly kind: "unknown_host" }
  | { readonly kind: "missing_token" }
  | { readonly kind: "invalid_token"; readonly reason: string }
  | { readonly kind: "expired" }
  | { readonly kind: "jwks_unavailable"; readonly reason: string }
  | { readonly kind: "member_disabled" };

/**
 * 1. Host が自分の aud のホストか → 2. Access Token の検証 → 3. member 行の解決 → 4. 権限の確定。
 * docs/design/07-api-auth-design.md の処理順序に対応する。
 * 「入れるか」は auth が Token 発行時と Refresh 時に判定済み。API は identity DB を見ず、
 * 自分の DB の役割と上書きだけで何ができるかを決める。member 行が無ければ最下位の役割で作る。
 */
export async function resolveTenantContext(
  deps: ResolveTenantContextDeps,
  input: { readonly host: string; readonly authorization: string | undefined },
): Promise<Result<TenantContext, TenantContextError>> {
  // aud はプロセスごとに 1 つ。別サービスのホストで受けたリクエストは存在しない扱いにする
  if (input.host.toLowerCase() !== new URL(deps.audience).host)
    return err({ kind: "unknown_host" });

  const token = readBearerToken(input.authorization);
  if (token === undefined) return err({ kind: "missing_token" });
  const verified = await verifyAccessToken(token, deps);
  if (!verified.ok) return verified;
  const claims = verified.value;

  const member =
    (await deps.members.find(claims.tenantId, claims.userId)) ??
    (await deps.members.upsert({
      tenantId: claims.tenantId,
      userId: claims.userId,
      email: null,
      name: null,
      role: deps.definition.defaultRole,
      status: "active",
    }));
  if (member.status !== "active") return err({ kind: "member_disabled" });

  const overrides = await deps.members.listOverrides(claims.tenantId, claims.userId);
  return ok({
    tenantId: claims.tenantId,
    tenantSlug: claims.tenantSlug,
    userId: claims.userId,
    clientId: claims.clientId,
    member,
    permissions: resolvePermissions(deps.definition, member.role, overrides),
  });
}
