import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ulid } from "ulid";
import {
  postInputSchema,
  postPatchSchema,
  type Post as PostJson,
  type PostResponse,
  type PostsResponse,
} from "@sandbox/api-contract";
import { requirePermission, type ApiEnv } from "@sandbox/api-core";
import type { Post, PostRepository } from "./repository.ts";

function toJson(post: Post): PostJson {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    author_id: post.authorId,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
  };
}

const invalid = (result: { success: boolean }, c: Context) =>
  result.success ? undefined : c.json({ error: "invalid_request" }, 400);

/**
 * /v1/posts。タイトルと本文の投稿。
 */
export function postRoutes(repo: PostRepository): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get("/v1/posts", requirePermission("posts:read"), async (c) => {
    const ctx = c.get("tenantContext");
    return c.json({ posts: (await repo.list(ctx.tenantId)).map(toJson) } satisfies PostsResponse);
  });

  app.get("/v1/posts/:id", requirePermission("posts:read"), async (c) => {
    const ctx = c.get("tenantContext");
    const post = await repo.findById(ctx.tenantId, c.req.param("id"));
    if (post === undefined) return c.json({ error: "not_found" }, 404);
    return c.json({ post: toJson(post) } satisfies PostResponse);
  });

  app.post(
    "/v1/posts",
    requirePermission("posts:create"),
    zValidator("json", postInputSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const created = await repo.create(ctx.tenantId, ulid(), ctx.userId, c.req.valid("json"));
      return c.json({ post: toJson(created) }, 201);
    },
  );

  app.patch(
    "/v1/posts/:id",
    requirePermission("posts:update"),
    zValidator("json", postPatchSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const updated = await repo.update(ctx.tenantId, c.req.param("id"), c.req.valid("json"));
      if (updated === undefined) return c.json({ error: "not_found" }, 404);
      return c.json({ post: toJson(updated) });
    },
  );

  app.delete("/v1/posts/:id", requirePermission("posts:delete"), async (c) => {
    const ctx = c.get("tenantContext");
    const removed = await repo.remove(ctx.tenantId, c.req.param("id"));
    if (!removed) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  return app;
}
