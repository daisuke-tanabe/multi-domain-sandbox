import { ulid } from "ulid";
import { notFound, type NotFoundError, type TenantContext } from "@sandbox/api-core";
import { err, ok, type Result } from "@sandbox/shared";
import type { Post, PostInput, PostInputPatch } from "../domain/post.ts";
import type { PostRepository } from "./post-repository.ts";

export interface PostDeps {
  readonly posts: PostRepository;
}

/**
 * 投稿のユースケース。権限の最終判定は interface の requirePermission が行う
 */
export function listPosts(deps: PostDeps, ctx: TenantContext): Promise<ReadonlyArray<Post>> {
  return deps.posts.list(ctx.tenantId);
}

export async function getPost(
  deps: PostDeps,
  ctx: TenantContext,
  id: string,
): Promise<Result<Post, NotFoundError>> {
  const post = await deps.posts.findById(ctx.tenantId, id);
  return post === undefined ? err(notFound()) : ok(post);
}

export function createPost(deps: PostDeps, ctx: TenantContext, input: PostInput): Promise<Post> {
  return deps.posts.create(ctx.tenantId, ulid(), ctx.userId, input);
}

export async function updatePost(
  deps: PostDeps,
  ctx: TenantContext,
  id: string,
  input: PostInputPatch,
): Promise<Result<Post, NotFoundError>> {
  const updated = await deps.posts.update(ctx.tenantId, id, input);
  return updated === undefined ? err(notFound()) : ok(updated);
}

export async function deletePost(
  deps: PostDeps,
  ctx: TenantContext,
  id: string,
): Promise<Result<void, NotFoundError>> {
  const removed = await deps.posts.remove(ctx.tenantId, id);
  return removed ? ok(undefined) : err(notFound());
}
