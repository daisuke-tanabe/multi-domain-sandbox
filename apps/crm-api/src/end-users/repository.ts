import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "@sandbox/api-core";

/**
 * CRM が管理するエンドユーザー。ログインする人ではなく顧客データ。
 */
export interface EndUser {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly note: string;
}

export interface EndUserInput {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly note: string;
}

/** 部分更新。省略した項目は変えない */
export interface EndUserInputPatch {
  readonly name?: string | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly note?: string | undefined;
}

export interface EndUserRepository {
  list(tenantId: string): Promise<ReadonlyArray<EndUser>>;
  /** 他テナントの ID を指定しても undefined。存在の有無を漏らさない */
  findById(tenantId: string, id: string): Promise<EndUser | undefined>;
  create(tenantId: string, id: string, input: EndUserInput): Promise<EndUser>;
  update(tenantId: string, id: string, input: EndUserInputPatch): Promise<EndUser | undefined>;
  remove(tenantId: string, id: string): Promise<boolean>;
}

const row = z.object({
  id: z.string(),
  tenant_id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  note: z.string(),
});

function toEndUser(r: z.infer<typeof row>): EndUser {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    note: r.note,
  };
}

const COLUMNS = "id, tenant_id, name, email, phone, note";

export class PgEndUserRepository implements EndUserRepository {
  constructor(private readonly pool: Pool) {}

  public list(tenantId: string): Promise<ReadonlyArray<EndUser>> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM crm.end_users WHERE tenant_id = $1 ORDER BY created_at`,
        [tenantId],
      );
      return result.rows.map((r) => toEndUser(row.parse(r)));
    });
  }

  public findById(tenantId: string, id: string): Promise<EndUser | undefined> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM crm.end_users WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
      );
      const first: unknown = result.rows[0];
      return first === undefined ? undefined : toEndUser(row.parse(first));
    });
  }

  public create(tenantId: string, id: string, input: EndUserInput): Promise<EndUser> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO crm.end_users (id, tenant_id, name, email, phone, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
        [id, tenantId, input.name, input.email, input.phone, input.note],
      );
      return toEndUser(row.parse(result.rows[0]));
    });
  }

  public update(
    tenantId: string,
    id: string,
    input: EndUserInputPatch,
  ): Promise<EndUser | undefined> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `UPDATE crm.end_users
            SET name = COALESCE($3, name), email = COALESCE($4, email),
                phone = COALESCE($5, phone), note = COALESCE($6, note)
          WHERE tenant_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
        [
          tenantId,
          id,
          input.name ?? null,
          input.email ?? null,
          input.phone ?? null,
          input.note ?? null,
        ],
      );
      const first: unknown = result.rows[0];
      return first === undefined ? undefined : toEndUser(row.parse(first));
    });
  }

  public remove(tenantId: string, id: string): Promise<boolean> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        "DELETE FROM crm.end_users WHERE tenant_id = $1 AND id = $2",
        [tenantId, id],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }
}

/** テスト用 */
export class MemoryEndUserRepository implements EndUserRepository {
  private readonly rows: Map<string, EndUser>;

  constructor(initial: ReadonlyArray<EndUser> = []) {
    this.rows = new Map(initial.map((u) => [u.id, u]));
  }

  public async list(tenantId: string): Promise<ReadonlyArray<EndUser>> {
    return [...this.rows.values()].filter((u) => u.tenantId === tenantId);
  }

  public async findById(tenantId: string, id: string): Promise<EndUser | undefined> {
    const found = this.rows.get(id);
    return found?.tenantId === tenantId ? found : undefined;
  }

  public async create(tenantId: string, id: string, input: EndUserInput): Promise<EndUser> {
    const created: EndUser = { id, tenantId, ...input };
    this.rows.set(id, created);
    return created;
  }

  public async update(
    tenantId: string,
    id: string,
    input: EndUserInputPatch,
  ): Promise<EndUser | undefined> {
    const existing = await this.findById(tenantId, id);
    if (existing === undefined) return undefined;
    const updated: EndUser = {
      ...existing,
      name: input.name ?? existing.name,
      email: input.email ?? existing.email,
      phone: input.phone ?? existing.phone,
      note: input.note ?? existing.note,
    };
    this.rows.set(id, updated);
    return updated;
  }

  public async remove(tenantId: string, id: string): Promise<boolean> {
    const existing = await this.findById(tenantId, id);
    if (existing === undefined) return false;
    this.rows.delete(id);
    return true;
  }
}
