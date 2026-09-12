import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  postInputSchema,
  postPatchSchema,
  type Post as PostJson,
  type PostResponse,
  type PostsResponse,
} from "@sandbox/api-contract";
import { requirePermission, type ApiEnv, type NotFoundError } from "@sandbox/api-core";
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  updatePost,
  type PostDeps,
} from "../application/posts.ts";
import type { Post } from "../domain/post.ts";

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

function respondError(c: Context, error: NotFoundError): Response {
  return c.json({ error: error.kind }, 404);
}

const invalid = (result: { success: boolean }, c: Context) =>
  result.success ? undefined : c.json({ error: "invalid_request" }, 400);

/**
 * /v1/posts。入力検証とユースケース呼び出しと契約の型への写しだけを行う。
 */
export function postRoutes(deps: PostDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get("/v1/posts", requirePermission("posts:read"), async (c) => {
    const posts = await listPosts(deps, c.get("tenantContext"));
    return c.json({ posts: posts.map(toJson) } satisfies PostsResponse);
  });

  app.get("/v1/posts/:id", requirePermission("posts:read"), async (c) => {
    const result = await getPost(deps, c.get("tenantContext"), c.req.param("id"));
    if (!result.ok) return respondError(c, result.error);
    return c.json({ post: toJson(result.value) } satisfies PostResponse);
  });

  app.post(
    "/v1/posts",
    requirePermission("posts:create"),
    zValidator("json", postInputSchema, invalid),
    async (c) => {
      const created = await createPost(deps, c.get("tenantContext"), c.req.valid("json"));
      return c.json({ post: toJson(created) } satisfies PostResponse, 201);
    },
  );

  app.patch(
    "/v1/posts/:id",
    requirePermission("posts:update"),
    zValidator("json", postPatchSchema, invalid),
    async (c) => {
      const result = await updatePost(
        deps,
        c.get("tenantContext"),
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!result.ok) return respondError(c, result.error);
      return c.json({ post: toJson(result.value) } satisfies PostResponse);
    },
  );

  app.delete("/v1/posts/:id", requirePermission("posts:delete"), async (c) => {
    const result = await deletePost(deps, c.get("tenantContext"), c.req.param("id"));
    if (!result.ok) return respondError(c, result.error);
    return c.body(null, 204);
  });

  return app;
}
