import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import type {
  IdentityMembership,
  IdentityReader,
  IdentityTenant,
  IdentityUser,
} from "../ports/identity-reader.ts";
import type { Project, ProjectRepository, TenantContext } from "../ports/project-repository.ts";

const userRow = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  status: z.enum(["active", "disabled"]),
});

const tenantRow = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.enum(["active", "suspended"]),
});

const membershipRow = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
  status: z.enum(["active", "invited", "disabled"]),
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

  public async findUserById(id: string): Promise<IdentityUser | undefined> {
    const result = await this.pool.query(
      "SELECT id, email, name, status FROM identity.users WHERE id = $1",
      [id],
    );
    const first = result.rows[0];
    return first === undefined ? undefined : userRow.parse(first);
  }

  public async findTenantById(id: string): Promise<IdentityTenant | undefined> {
    const result = await this.pool.query(
      "SELECT id, slug, status FROM identity.tenants WHERE id = $1",
      [id],
    );
    const first = result.rows[0];
    return first === undefined ? undefined : tenantRow.parse(first);
  }

  public async findMembership(
    tenantId: string,
    userId: string,
  ): Promise<IdentityMembership | undefined> {
    const result = await this.pool.query(
      "SELECT role, status FROM identity.tenant_members WHERE tenant_id = $1 AND user_id = $2",
      [tenantId, userId],
    );
    const first = result.rows[0];
    return first === undefined ? undefined : membershipRow.parse(first);
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

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}
