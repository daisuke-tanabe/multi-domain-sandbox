import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  membershipStatusSchema,
  queryOne,
  roleSchema,
  tenantStatusSchema,
  userStatusSchema,
} from "@sandbox/shared";
import type { AccessContext, IdentityReader } from "../ports/identity-reader.ts";
import type { Project, ProjectRepository, TenantContext } from "../ports/project-repository.ts";

const accessContextRow = z.object({
  user_id: z.string().nullable(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  user_status: userStatusSchema.nullable(),
  tenant_id: z.string().nullable(),
  slug: z.string().nullable(),
  tenant_status: tenantStatusSchema.nullable(),
  role: roleSchema.nullable(),
  membership_status: membershipStatusSchema.nullable(),
});

const projectRow = z.object({
  id: z.string(),
  tenant_id: z.string(),
  name: z.string(),
  created_by: z.string(),
});

function toProject(row: z.infer<typeof projectRow>): Project {
  return { id: row.id, tenantId: row.tenant_id, name: row.name, createdBy: row.created_by };
}

/**
 * sandbox_api ロールで identity スキーマを読む。SELECT 権限のみ。
 */
export class PgIdentityReader implements IdentityReader {
  constructor(private readonly pool: Pool) {}

  public async findAccessContext(userId: string, tenantId: string): Promise<AccessContext> {
    // 1 往復で 3 行分を引く。存在しないものは NULL になる
    const row = await queryOne(
      this.pool,
      accessContextRow,
      `SELECT u.id AS user_id, u.email, u.name, u.status AS user_status,
              t.id AS tenant_id, t.slug, t.status AS tenant_status,
              m.role, m.status AS membership_status
         FROM (SELECT $1::text AS user_id, $2::text AS tenant_id) p
         LEFT JOIN identity.users u ON u.id = p.user_id
         LEFT JOIN identity.tenants t ON t.id = p.tenant_id
         LEFT JOIN identity.tenant_members m ON m.user_id = p.user_id AND m.tenant_id = p.tenant_id`,
      [userId, tenantId],
    );
    if (row === undefined) return { user: undefined, tenant: undefined, membership: undefined };
    return {
      user:
        row.user_id !== null && row.email !== null && row.user_status !== null
          ? { id: row.user_id, email: row.email, name: row.name, status: row.user_status }
          : undefined,
      tenant:
        row.tenant_id !== null && row.slug !== null && row.tenant_status !== null
          ? { id: row.tenant_id, slug: row.slug, status: row.tenant_status }
          : undefined,
      membership:
        row.role !== null && row.membership_status !== null
          ? { role: row.role, status: row.membership_status }
          : undefined,
    };
  }
}

/**
 * business.projects。トランザクションごとに app.tenant_id を設定し、RLS を二重防御として効かせる。
 * アプリ層でも必ず tenant_id 条件を付ける。
 */
export class PgProjectRepository implements ProjectRepository {
  constructor(private readonly pool: Pool) {}

  private async withTenant<T>(
    ctx: TenantContext,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw new Error("tenant transaction failed", { cause: error });
    } finally {
      client.release();
    }
  }

  public list(ctx: TenantContext): Promise<ReadonlyArray<Project>> {
    return this.withTenant(ctx, async (client) => {
      const result = await client.query(
        "SELECT id, tenant_id, name, created_by FROM business.projects WHERE tenant_id = $1 ORDER BY created_at",
        [ctx.tenantId],
      );
      return result.rows.map((row) => toProject(projectRow.parse(row)));
    });
  }

  public findById(ctx: TenantContext, id: string): Promise<Project | undefined> {
    return this.withTenant(ctx, async (client) => {
      const result = await client.query(
        "SELECT id, tenant_id, name, created_by FROM business.projects WHERE id = $1 AND tenant_id = $2",
        [id, ctx.tenantId],
      );
      const first = result.rows[0];
      return first === undefined ? undefined : toProject(projectRow.parse(first));
    });
  }

  public create(ctx: TenantContext, input: { id: string; name: string }): Promise<Project> {
    return this.withTenant(ctx, async (client) => {
      const result = await client.query(
        `INSERT INTO business.projects (id, tenant_id, name, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, name, created_by`,
        [input.id, ctx.tenantId, input.name, ctx.userId],
      );
      return toProject(projectRow.parse(result.rows[0]));
    });
  }
}
