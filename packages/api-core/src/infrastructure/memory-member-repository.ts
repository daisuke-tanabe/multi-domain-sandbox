import type { Member, PermissionOverride } from "../domain/member.ts";
import type {
  MemberRepository,
  MemberWithOverrides,
} from "../application/ports/member-repository.ts";

/**
 * テスト用のインメモリ実装。
 */
export class MemoryMemberRepository implements MemberRepository {
  private readonly members = new Map<string, Member>();
  private readonly overrides = new Map<string, ReadonlyArray<PermissionOverride>>();

  constructor(
    initial: ReadonlyArray<Member> = [],
    initialOverrides: ReadonlyArray<{ tenantId: string; userId: string } & PermissionOverride> = [],
  ) {
    for (const member of initial) this.members.set(key(member.tenantId, member.userId), member);
    for (const override of initialOverrides) {
      const k = key(override.tenantId, override.userId);
      this.overrides.set(k, [
        ...(this.overrides.get(k) ?? []),
        { permission: override.permission, effect: override.effect },
      ]);
    }
  }

  public async find(tenantId: string, userId: string): Promise<Member | undefined> {
    return this.members.get(key(tenantId, userId));
  }

  public async findWithOverrides(
    tenantId: string,
    userId: string,
  ): Promise<MemberWithOverrides | undefined> {
    const member = this.members.get(key(tenantId, userId));
    if (member === undefined) return undefined;
    return { member, overrides: this.overrides.get(key(tenantId, userId)) ?? [] };
  }

  public async list(tenantId: string): Promise<ReadonlyArray<Member>> {
    return [...this.members.values()].filter((m) => m.tenantId === tenantId);
  }

  public async upsert(member: Member): Promise<Member> {
    const existing = this.members.get(key(member.tenantId, member.userId));
    const merged: Member = {
      ...member,
      email: member.email ?? existing?.email ?? null,
      name: member.name ?? existing?.name ?? null,
    };
    this.members.set(key(member.tenantId, member.userId), merged);
    return merged;
  }

  public async remove(tenantId: string, userId: string): Promise<void> {
    this.members.delete(key(tenantId, userId));
    this.overrides.delete(key(tenantId, userId));
  }

  public async replaceOverrides(
    tenantId: string,
    userId: string,
    overrides: ReadonlyArray<PermissionOverride>,
  ): Promise<void> {
    this.overrides.set(key(tenantId, userId), [...overrides]);
  }
}

function key(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}
