import { err, ok, type Logger, type Result } from "@sandbox/shared";
import type { Member, PermissionOverride } from "../domain/member.ts";
import { resolvePermissions, type ServiceDefinition } from "../domain/service-definition.ts";
import type { AuthAdminClient, AuthAdminError } from "./ports/auth-admin.ts";
import type { MemberRepository } from "./ports/member-repository.ts";

export interface MemberUsecaseDeps {
  readonly definition: ServiceDefinition;
  readonly members: MemberRepository;
  readonly authAdmin: AuthAdminClient;
  readonly logger: Logger;
}

export type MemberError =
  | { readonly kind: "not_found" }
  | { readonly kind: "cannot_remove_self" }
  | { readonly kind: "auth_admin"; readonly error: AuthAdminError };

export interface MemberDetail {
  readonly member: Member;
  readonly overrides: ReadonlyArray<PermissionOverride>;
  readonly permissions: ReadonlySet<string>;
}

/**
 * 管理アカウントの一覧、招待、役割変更、権限の上書き、削除。
 * 招待と削除は auth-api の管理 API で「入れるか」を変え、役割と上書きは自分の DB に持つ。
 */
export function listMembers(
  deps: MemberUsecaseDeps,
  tenantId: string,
): Promise<ReadonlyArray<Member>> {
  return deps.members.list(tenantId);
}

export async function getMemberDetail(
  deps: MemberUsecaseDeps,
  tenantId: string,
  userId: string,
): Promise<Result<MemberDetail, MemberError>> {
  const found = await deps.members.findWithOverrides(tenantId, userId);
  if (found === undefined) return err({ kind: "not_found" });
  return ok({
    ...found,
    permissions: resolvePermissions(deps.definition, found.member.role, found.overrides),
  });
}

export async function inviteMember(
  deps: MemberUsecaseDeps,
  tenantId: string,
  input: { readonly email: string; readonly name: string | null; readonly role: string },
): Promise<Result<{ member: Member; linked: boolean }, MemberError>> {
  // 先に auth に「入れる」を登録し、その user_id で自分の member 行を作る
  const invited = await deps.authAdmin.invite({ tenantId, email: input.email, name: input.name });
  if (!invited.ok) return err({ kind: "auth_admin", error: invited.error });
  const member = await deps.members.upsert({
    tenantId,
    userId: invited.value.userId,
    email: invited.value.email,
    name: invited.value.name,
    role: input.role,
    status: "active",
  });
  deps.logger.info("member invited", { tenantId, userId: member.userId });
  return ok({ member, linked: invited.value.linked });
}

export async function changeMemberRole(
  deps: MemberUsecaseDeps,
  tenantId: string,
  userId: string,
  role: string,
): Promise<Result<Member, MemberError>> {
  const existing = await deps.members.find(tenantId, userId);
  if (existing === undefined) return err({ kind: "not_found" });
  return ok(await deps.members.upsert({ ...existing, role }));
}

export async function replaceMemberOverrides(
  deps: MemberUsecaseDeps,
  tenantId: string,
  userId: string,
  overrides: ReadonlyArray<PermissionOverride>,
): Promise<
  Result<
    { overrides: ReadonlyArray<PermissionOverride>; permissions: ReadonlySet<string> },
    MemberError
  >
> {
  const existing = await deps.members.find(tenantId, userId);
  if (existing === undefined) return err({ kind: "not_found" });
  await deps.members.replaceOverrides(tenantId, existing.userId, overrides);
  return ok({
    overrides,
    permissions: resolvePermissions(deps.definition, existing.role, overrides),
  });
}

export async function removeMember(
  deps: MemberUsecaseDeps,
  tenantId: string,
  actorUserId: string,
  userId: string,
): Promise<Result<void, MemberError>> {
  if (userId === actorUserId) return err({ kind: "cannot_remove_self" });
  const existing = await deps.members.find(tenantId, userId);
  if (existing === undefined) return err({ kind: "not_found" });
  const revoked = await deps.authAdmin.revoke({ tenantId, userId });
  // auth 側に既に無い人でも、自分の DB の行は消して整合させる
  if (!revoked.ok && revoked.error.kind !== "user_not_found") {
    return err({ kind: "auth_admin", error: revoked.error });
  }
  await deps.members.remove(tenantId, userId);
  deps.logger.info("member removed", { tenantId, userId });
  return ok(undefined);
}
