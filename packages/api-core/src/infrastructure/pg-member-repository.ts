import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "./db.ts";
import type { Member, PermissionOverride } from "../domain/member.ts";
import type { MemberRepository } from "../application/ports/member-repository.ts";

const memberRow = z.object({
  tenant_id: z.string(),
  user_id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  role: z.string(),
  status: z.enum(["active", "disabled"]),
});

const overrideRow = z.object({
  permission: z.string(),
  effect: z.enum(["allow", "deny"]),
});

function toMember(row: z.infer<typeof memberRow>): Member {
  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
  };
}

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
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ${this.schema}.members WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
      const first: unknown = result.rows[0];
      return first === undefined ? undefined : toMember(memberRow.parse(first));
    });
  }

  public list(tenantId: string): Promise<ReadonlyArray<Member>> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ${this.schema}.members WHERE tenant_id = $1 ORDER BY created_at`,
        [tenantId],
      );
      return result.rows.map((row) => toMember(memberRow.parse(row)));
    });
  }

  public upsert(member: Member): Promise<Member> {
    return withTenant(this.pool, member.tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO ${this.schema}.members (tenant_id, user_id, email, name, role, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, user_id) DO UPDATE
           SET email = COALESCE(EXCLUDED.email, ${this.schema}.members.email),
               name = COALESCE(EXCLUDED.name, ${this.schema}.members.name),
               role = EXCLUDED.role,
               status = EXCLUDED.status
         RETURNING ${COLUMNS}`,
        [member.tenantId, member.userId, member.email, member.name, member.role, member.status],
      );
      return toMember(memberRow.parse(result.rows[0]));
    });
  }

  public remove(tenantId: string, userId: string): Promise<void> {
    return withTenant(this.pool, tenantId, async (client) => {
      await client.query(
        `DELETE FROM ${this.schema}.members WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
    });
  }

  public listOverrides(
    tenantId: string,
    userId: string,
  ): Promise<ReadonlyArray<PermissionOverride>> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT permission, effect FROM ${this.schema}.permission_overrides
          WHERE tenant_id = $1 AND user_id = $2 ORDER BY permission`,
        [tenantId, userId],
      );
      return result.rows.map((row) => overrideRow.parse(row));
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
      for (const override of overrides) {
        await client.query(
          `INSERT INTO ${this.schema}.permission_overrides (tenant_id, user_id, permission, effect)
           VALUES ($1, $2, $3, $4)`,
          [tenantId, userId, override.permission, override.effect],
        );
      }
    });
  }
}
