import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "@sandbox/api-core";
import { queryAll, queryOne, queryRequired } from "@sandbox/shared";
import type { PostRepository } from "../application/post-repository.ts";
import type { Post, PostInput, PostInputPatch } from "../domain/post.ts";

const row = z
  .object({
    id: z.string(),
    tenant_id: z.string(),
    title: z.string(),
    body: z.string(),
    author_id: z.string(),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
  })
  .transform((r): Post => ({
    id: r.id,
    tenantId: r.tenant_id,
    title: r.title,
    body: r.body,
    authorId: r.author_id,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));

const COLUMNS = "id, tenant_id, title, body, author_id, created_at, updated_at";

export class PgPostRepository implements PostRepository {
  constructor(private readonly pool: Pool) {}

  public list(tenantId: string): Promise<ReadonlyArray<Post>> {
    return withTenant(this.pool, tenantId, (client) =>
      queryAll(
        client,
        row,
        `SELECT ${COLUMNS} FROM cms.posts WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      ),
    );
  }

  public findById(tenantId: string, id: string): Promise<Post | undefined> {
    return withTenant(this.pool, tenantId, (client) =>
      queryOne(client, row, `SELECT ${COLUMNS} FROM cms.posts WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        id,
      ]),
    );
  }

  public create(tenantId: string, id: string, authorId: string, input: PostInput): Promise<Post> {
    return withTenant(this.pool, tenantId, (client) =>
      queryRequired(
        client,
        row,
        `INSERT INTO cms.posts (id, tenant_id, title, body, author_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
        [id, tenantId, input.title, input.body, authorId],
      ),
    );
  }

  public update(tenantId: string, id: string, input: PostInputPatch): Promise<Post | undefined> {
    return withTenant(this.pool, tenantId, (client) =>
      queryOne(
        client,
        row,
        `UPDATE cms.posts SET title = COALESCE($3, title), body = COALESCE($4, body)
          WHERE tenant_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
        [tenantId, id, input.title ?? null, input.body ?? null],
      ),
    );
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
