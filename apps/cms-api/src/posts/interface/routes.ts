import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  postInputSchema,
  postPatchSchema,
  type Post as PostJson,
  type PostResponse,
  type PostsResponse,
} from "@sandbox/api-contract";
import { invalidJson, notFoundResponse, requirePermission, type ApiEnv } from "@sandbox/api-core";
import type { PostRepository } from "../application/post-repository.ts";
import { createPost, deletePost, getPost, listPosts, updatePost } from "../application/posts.ts";
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

/**
 * /v1/posts。入力検証とユースケース呼び出しと契約の型への写しだけを行う。
 */
export function postRoutes(posts: PostRepository): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get("/v1/posts", requirePermission("posts:read"), async (c) => {
    const list = await listPosts(posts, c.get("tenantContext"));
    return c.json({ posts: list.map(toJson) } satisfies PostsResponse);
  });

  app.get("/v1/posts/:id", requirePermission("posts:read"), async (c) => {
    const result = await getPost(posts, c.get("tenantContext"), c.req.param("id"));
    if (!result.ok) return notFoundResponse(c);
    return c.json({ post: toJson(result.value) } satisfies PostResponse);
  });

  app.post(
    "/v1/posts",
    requirePermission("posts:create"),
    zValidator("json", postInputSchema, invalidJson),
    async (c) => {
      const created = await createPost(posts, c.get("tenantContext"), c.req.valid("json"));
      return c.json({ post: toJson(created) } satisfies PostResponse, 201);
    },
  );

  app.patch(
    "/v1/posts/:id",
    requirePermission("posts:update"),
    zValidator("json", postPatchSchema, invalidJson),
    async (c) => {
      const result = await updatePost(
        posts,
        c.get("tenantContext"),
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!result.ok) return notFoundResponse(c);
      return c.json({ post: toJson(result.value) } satisfies PostResponse);
    },
  );

  app.delete("/v1/posts/:id", requirePermission("posts:delete"), async (c) => {
    const result = await deletePost(posts, c.get("tenantContext"), c.req.param("id"));
    if (!result.ok) return notFoundResponse(c);
    return c.body(null, 204);
  });

  return app;
}
