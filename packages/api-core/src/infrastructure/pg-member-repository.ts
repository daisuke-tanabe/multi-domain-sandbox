import type { Pool } from "pg";
import { z } from "zod";
import { queryAll, queryOne, queryRequired } from "@sandbox/shared";
import { withTenant } from "./db.ts";
import type { Member, PermissionOverride } from "../domain/member.ts";
import type {
  MemberRepository,
  MemberWithOverrides,
} from "../application/ports/member-repository.ts";

const memberRow = z
  .object({
    tenant_id: z.string(),
    user_id: z.string(),
    email: z.string().nullable(),
    name: z.string().nullable(),
    role: z.string(),
    status: z.enum(["active", "disabled"]),
  })
  .transform((row): Member => ({
    tenantId: row.tenant_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
  }));

const overrideRow: z.ZodType<PermissionOverride> = z.object({
  permission: z.string(),
  effect: z.enum(["allow", "deny"]),
});

const COLUMNS = "tenant_id, user_id, email, name, role, status";

/**
 * <schema>.members と <schema>.permission_overrides。DDL は db/<service>/init にある。
 * スキーマ名は固定の識別子で、リクエストの値は入らない。
 */
export class PgMemberRepository implements MemberRepository {
  constructor(
    private readonly pool: Pool,
    private readonly schema: string,
  ) {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`invalid schema name ${schema}`);
  }

  public find(tenantId: string, userId: string): Promise<Member | undefined> {
    return withTenant(this.pool, tenantId, (client) =>
      queryOne(client, memberRow, this.selectMember(), [tenantId, userId]),
    );
  }

  public findWithOverrides(
    tenantId: string,
    userId: string,
  ): Promise<MemberWithOverrides | undefined> {
    return withTenant(this.pool, tenantId, async (client) => {
      const member = await queryOne(client, memberRow, this.selectMember(), [tenantId, userId]);
      if (member === undefined) return undefined;
      const overrides = await queryAll(
        client,
        overrideRow,
        `SELECT permission, effect FROM ${this.schema}.permission_overrides
          WHERE tenant_id = $1 AND user_id = $2 ORDER BY permission`,
        [tenantId, userId],
      );
      return { member, overrides };
    });
  }

  public list(tenantId: string): Promise<ReadonlyArray<Member>> {
    return withTenant(this.pool, tenantId, (client) =>
      queryAll(
        client,
        memberRow,
        `SELECT ${COLUMNS} FROM ${this.schema}.members WHERE tenant_id = $1 ORDER BY created_at`,
        [tenantId],
      ),
    );
  }

  public upsert(member: Member): Promise<Member> {
    return withTenant(this.pool, member.tenantId, (client) =>
      queryRequired(
        client,
        memberRow,
        `INSERT INTO ${this.schema}.members (tenant_id, user_id, email, name, role, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, user_id) DO UPDATE
           SET email = COALESCE(EXCLUDED.email, ${this.schema}.members.email),
               name = COALESCE(EXCLUDED.name, ${this.schema}.members.name),
               role = EXCLUDED.role,
               status = EXCLUDED.status
         RETURNING ${COLUMNS}`,
        [member.tenantId, member.userId, member.email, member.name, member.role, member.status],
      ),
    );
  }

  public remove(tenantId: string, userId: string): Promise<void> {
    return withTenant(this.pool, tenantId, async (client) => {
      await client.query(
        `DELETE FROM ${this.schema}.members WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
    });
  }

  public replaceOverrides(
    tenantId: string,
    userId: string,
    overrides: ReadonlyArray<PermissionOverride>,
  ): Promise<void> {
    return withTenant(this.pool, tenantId, async (client) => {
      await client.query(
        `DELETE FROM ${this.schema}.permission_overrides WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
      if (overrides.length === 0) return;
      // 配列を unnest して 1 文で入れる。50 件を往復させない
      await client.query(
        `INSERT INTO ${this.schema}.permission_overrides (tenant_id, user_id, permission, effect)
         SELECT $1, $2, permission, effect
           FROM unnest($3::text[], $4::text[]) AS t(permission, effect)`,
        [tenantId, userId, overrides.map((o) => o.permission), overrides.map((o) => o.effect)],
      );
    });
  }

  private selectMember(): string {
    return `SELECT ${COLUMNS} FROM ${this.schema}.members WHERE tenant_id = $1 AND user_id = $2`;
  }
}
