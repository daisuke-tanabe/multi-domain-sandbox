import type { EndUserRepository } from "../application/end-user-repository.ts";
import type { EndUser, EndUserInput, EndUserInputPatch } from "../domain/end-user.ts";

/** テスト用 */
export class MemoryEndUserRepository implements EndUserRepository {
  private readonly rows: Map<string, EndUser>;

  constructor(initial: ReadonlyArray<EndUser> = []) {
    this.rows = new Map(initial.map((u) => [u.id, u]));
  }

  public async list(tenantId: string): Promise<ReadonlyArray<EndUser>> {
    return [...this.rows.values()].filter((u) => u.tenantId === tenantId);
  }

  public async findById(tenantId: string, id: string): Promise<EndUser | undefined> {
    const found = this.rows.get(id);
    return found?.tenantId === tenantId ? found : undefined;
  }

  public async create(tenantId: string, id: string, input: EndUserInput): Promise<EndUser> {
    const created: EndUser = { id, tenantId, ...input };
    this.rows.set(id, created);
    return created;
  }

  public async update(
    tenantId: string,
    id: string,
    input: EndUserInputPatch,
  ): Promise<EndUser | undefined> {
    const existing = await this.findById(tenantId, id);
    if (existing === undefined) return undefined;
    const updated: EndUser = {
      ...existing,
      name: input.name ?? existing.name,
      email: input.email ?? existing.email,
      phone: input.phone ?? existing.phone,
      note: input.note ?? existing.note,
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
