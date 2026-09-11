import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "@sandbox/api-core";

export interface Post {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly body: string;
  readonly authorId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PostInput {
  readonly title: string;
  readonly body: string;
}

/** 部分更新。省略した項目は変えない */
export interface PostInputPatch {
  readonly title?: string | undefined;
  readonly body?: string | undefined;
}

export interface PostRepository {
  list(tenantId: string): Promise<ReadonlyArray<Post>>;
  findById(tenantId: string, id: string): Promise<Post | undefined>;
  create(tenantId: string, id: string, authorId: string, input: PostInput): Promise<Post>;
  update(tenantId: string, id: string, input: PostInputPatch): Promise<Post | undefined>;
  remove(tenantId: string, id: string): Promise<boolean>;
}

const row = z.object({
  id: z.string(),
  tenant_id: z.string(),
  title: z.string(),
  body: z.string(),
  author_id: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

function toPost(r: z.infer<typeof row>): Post {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    title: r.title,
    body: r.body,
    authorId: r.author_id,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

const COLUMNS = "id, tenant_id, title, body, author_id, created_at, updated_at";

export class PgPostRepository implements PostRepository {
  constructor(private readonly pool: Pool) {}

  public list(tenantId: string): Promise<ReadonlyArray<Post>> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM cms.posts WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      );
      return result.rows.map((r) => toPost(row.parse(r)));
    });
  }

  public findById(tenantId: string, id: string): Promise<Post | undefined> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM cms.posts WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
      );
      const first: unknown = result.rows[0];
      return first === undefined ? undefined : toPost(row.parse(first));
    });
  }

  public create(tenantId: string, id: string, authorId: string, input: PostInput): Promise<Post> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO cms.posts (id, tenant_id, title, body, author_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
        [id, tenantId, input.title, input.body, authorId],
      );
      return toPost(row.parse(result.rows[0]));
    });
  }

  public update(tenantId: string, id: string, input: PostInputPatch): Promise<Post | undefined> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `UPDATE cms.posts SET title = COALESCE($3, title), body = COALESCE($4, body)
          WHERE tenant_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
        [tenantId, id, input.title ?? null, input.body ?? null],
      );
      const first: unknown = result.rows[0];
      return first === undefined ? undefined : toPost(row.parse(first));
    });
  }

  public remove(tenantId: string, id: string): Promise<boolean> {
    return withTenant(this.pool, tenantId, async (client) => {
      const result = await client.query("DELETE FROM cms.posts WHERE tenant_id = $1 AND id = $2", [
        tenantId,
        id,
      ]);
      return (result.rowCount ?? 0) > 0;
    });
  }
}

/** テスト用 */
export class MemoryPostRepository implements PostRepository {
  private readonly rows: Map<string, Post>;

  constructor(initial: ReadonlyArray<Post> = []) {
    this.rows = new Map(initial.map((p) => [p.id, p]));
  }

  public async list(tenantId: string): Promise<ReadonlyArray<Post>> {
    return [...this.rows.values()].filter((p) => p.tenantId === tenantId);
  }

  public async findById(tenantId: string, id: string): Promise<Post | undefined> {
    const found = this.rows.get(id);
    return found?.tenantId === tenantId ? found : undefined;
  }

  public async create(
    tenantId: string,
    id: string,
    authorId: string,
    input: PostInput,
  ): Promise<Post> {
    const now = new Date(0).toISOString();
    const created: Post = { id, tenantId, authorId, ...input, createdAt: now, updatedAt: now };
    this.rows.set(id, created);
    return created;
  }

  public async update(
    tenantId: string,
    id: string,
    input: PostInputPatch,
  ): Promise<Post | undefined> {
    const existing = await this.findById(tenantId, id);
    if (existing === undefined) return undefined;
    const updated: Post = {
      ...existing,
      title: input.title ?? existing.title,
      body: input.body ?? existing.body,
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
