import { err, ok, type Result } from "@sandbox/shared";
import { ulid } from "ulid";
import type { OidcClient, ServiceMember, User } from "../../domain/identity.ts";
import type { AuthDeps } from "../deps.ts";
import { recordAudit } from "./audit.ts";
import { revokeClientAccess } from "./global-logout.ts";

/**
 * サービスが自分のテナントに人を招待する管理 API のロジック。
 * 呼び出し元は client_secret_basic で認証済みの Client で、自分のサービスへの割り当てだけを操作できる。
 * identity が持つのは「入れるか」まで。役割はサービス側が自分の DB に持つ。
 */
export type ServiceMemberError =
  | { readonly kind: "tenant_not_found" }
  | { readonly kind: "not_contracted" }
  | { readonly kind: "user_not_found" };

async function resolveContractedTenant(
  deps: AuthDeps,
  client: OidcClient,
  tenantId: string,
): Promise<Result<string, ServiceMemberError>> {
  const tenant = await deps.identity.findTenantById(tenantId);
  if (tenant === undefined) return err({ kind: "tenant_not_found" });
  const contract = await deps.identity.findContract(tenant.id, client.id);
  if (contract === undefined || contract.status !== "active")
    return err({ kind: "not_contracted" });
  return ok(tenant.id);
}

/**
 * メールで招待する。users に無ければ cognito_sub 未設定で事前作成し、初回ログイン時にメールで紐付ける。
 */
export async function inviteServiceMember(
  deps: AuthDeps,
  client: OidcClient,
  input: { readonly tenantId: string; readonly email: string; readonly name: string | null },
): Promise<Result<User, ServiceMemberError>> {
  const tenantId = await resolveContractedTenant(deps, client, input.tenantId);
  if (!tenantId.ok) return tenantId;

  const user =
    (await deps.identity.findUserByEmail(input.email)) ??
    (await deps.identity.createUser({
      id: ulid(),
      cognitoSub: null,
      email: input.email,
      name: input.name,
    }));
  await deps.identity.upsertServiceMembership(tenantId.value, client.id, user.id);
  await recordAudit(deps, {
    kind: "service_member_invited",
    userId: user.id,
    tenantId: tenantId.value,
    clientId: client.clientId,
    detail: { linked: user.cognitoSub !== null },
  });
  return ok(user);
}

export async function revokeServiceMember(
  deps: AuthDeps,
  client: OidcClient,
  input: { readonly tenantId: string; readonly userId: string },
): Promise<Result<void, ServiceMemberError>> {
  const tenantId = await resolveContractedTenant(deps, client, input.tenantId);
  if (!tenantId.ok) return tenantId;
  const user = await deps.identity.findUserById(input.userId);
  if (user === undefined) return err({ kind: "user_not_found" });
  await deps.identity.removeServiceMembership(tenantId.value, client.id, user.id);
  // 割り当てを消すだけでは Refresh まで使えてしまう。そのサービスへのアクセスだけを即時に切る
  const revokedSessions = await revokeClientAccess(deps, user.id, client, tenantId.value);
  await recordAudit(deps, {
    kind: "service_member_revoked",
    userId: user.id,
    tenantId: tenantId.value,
    clientId: client.clientId,
    detail: { revokedSessions },
  });
  return ok(undefined);
}

export async function listServiceMembers(
  deps: AuthDeps,
  client: OidcClient,
  tenantId: string,
): Promise<Result<ReadonlyArray<ServiceMember>, ServiceMemberError>> {
  const resolved = await resolveContractedTenant(deps, client, tenantId);
  if (!resolved.ok) return resolved;
  return ok(await deps.identity.listServiceMembers(resolved.value, client.id));
}
