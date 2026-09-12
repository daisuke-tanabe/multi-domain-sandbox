import { z } from "zod";
import { idSchema } from "../common/index.ts";

/**
 * cms-api の /v1/posts。タイトルと本文の投稿
 */
export const postInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000),
});
export type PostInput = z.infer<typeof postInputSchema>;

export const postPatchSchema = postInputSchema.partial();
export type PostPatch = z.infer<typeof postPatchSchema>;

export const postSchema = z.object({
  id: idSchema,
  title: z.string(),
  body: z.string(),
  author_id: idSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type Post = z.infer<typeof postSchema>;

export const postsResponseSchema = z.object({ posts: z.array(postSchema) });
export type PostsResponse = z.infer<typeof postsResponseSchema>;

export const postResponseSchema = z.object({ post: postSchema });
export type PostResponse = z.infer<typeof postResponseSchema>;
