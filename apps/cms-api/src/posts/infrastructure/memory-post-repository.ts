import type { PostRepository } from "../application/post-repository.ts";
import type { Post, PostInput, PostInputPatch } from "../domain/post.ts";

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
