import type { Member, PermissionOverride } from "../../domain/member.ts";

export interface MemberRepository {
  find(tenantId: string, userId: string): Promise<Member | undefined>;
  list(tenantId: string): Promise<ReadonlyArray<Member>>;
  /** 無ければ作り、あれば role / email / name / status を更新する */
  upsert(member: Member): Promise<Member>;
  remove(tenantId: string, userId: string): Promise<void>;
  listOverrides(tenantId: string, userId: string): Promise<ReadonlyArray<PermissionOverride>>;
  replaceOverrides(
    tenantId: string,
    userId: string,
    overrides: ReadonlyArray<PermissionOverride>,
  ): Promise<void>;
}
