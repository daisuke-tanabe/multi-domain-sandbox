import type { Member, PermissionOverride } from "../../domain/member.ts";

export interface MemberWithOverrides {
  readonly member: Member;
  readonly overrides: ReadonlyArray<PermissionOverride>;
}

export interface MemberRepository {
  find(tenantId: string, userId: string): Promise<Member | undefined>;
  /** member 行と権限の上書きを 1 つのトランザクションで読む。認可のたびに呼ぶ */
  findWithOverrides(tenantId: string, userId: string): Promise<MemberWithOverrides | undefined>;
  list(tenantId: string): Promise<ReadonlyArray<Member>>;
  /** 無ければ作り、あれば role / email / name / status を更新する */
  upsert(member: Member): Promise<Member>;
  remove(tenantId: string, userId: string): Promise<void>;
  replaceOverrides(
    tenantId: string,
    userId: string,
    overrides: ReadonlyArray<PermissionOverride>,
  ): Promise<void>;
}
