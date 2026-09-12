import { ulid } from "ulid";
import type { TenantContext } from "@sandbox/api-core";
import { err, ok, type Result } from "@sandbox/shared";
import type { Post, PostInput, PostInputPatch } from "../domain/post.ts";
import type { PostRepository } from "./post-repository.ts";

const NOT_FOUND = { kind: "not_found" } as const;

/**
 * 投稿のユースケース。権限の最終判定は interface の requirePermission が行う
 */
export function listPosts(posts: PostRepository, ctx: TenantContext): Promise<ReadonlyArray<Post>> {
  return posts.list(ctx.tenantId);
}

export async function getPost(
  posts: PostRepository,
  ctx: TenantContext,
  id: string,
): Promise<Result<Post, typeof NOT_FOUND>> {
  const post = await posts.findById(ctx.tenantId, id);
  return post === undefined ? err(NOT_FOUND) : ok(post);
}

export function createPost(
  posts: PostRepository,
  ctx: TenantContext,
  input: PostInput,
): Promise<Post> {
  return posts.create(ctx.tenantId, ulid(), ctx.userId, input);
}

export async function updatePost(
  posts: PostRepository,
  ctx: TenantContext,
  id: string,
  input: PostInputPatch,
): Promise<Result<Post, typeof NOT_FOUND>> {
  const updated = await posts.update(ctx.tenantId, id, input);
  return updated === undefined ? err(NOT_FOUND) : ok(updated);
}

export async function deletePost(
  posts: PostRepository,
  ctx: TenantContext,
  id: string,
): Promise<Result<void, typeof NOT_FOUND>> {
  const removed = await posts.remove(ctx.tenantId, id);
  return removed ? ok(undefined) : err(NOT_FOUND);
}
