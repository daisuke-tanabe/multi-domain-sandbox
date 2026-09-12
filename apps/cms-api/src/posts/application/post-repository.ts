import type { Post, PostInput, PostInputPatch } from "../domain/post.ts";

export interface PostRepository {
  list(tenantId: string): Promise<ReadonlyArray<Post>>;
  findById(tenantId: string, id: string): Promise<Post | undefined>;
  create(tenantId: string, id: string, authorId: string, input: PostInput): Promise<Post>;
  update(tenantId: string, id: string, input: PostInputPatch): Promise<Post | undefined>;
  remove(tenantId: string, id: string): Promise<boolean>;
}
