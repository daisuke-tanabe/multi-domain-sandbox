import type {
  IdentityMembership,
  IdentityReader,
  IdentityTenant,
  IdentityUser,
} from "../ports/identity-reader.ts";
import type { Project, ProjectRepository, TenantContext } from "../ports/project-repository.ts";

/**
 * テスト用のインメモリ実装。
 */
export interface MemoryIdentityData {
  readonly users: ReadonlyArray<IdentityUser>;
  readonly tenants: ReadonlyArray<IdentityTenant>;
  readonly memberships: ReadonlyArray<{ tenantId: string; userId: string } & IdentityMembership>;
}

export class MemoryIdentityReader implements IdentityReader {
  constructor(private data: MemoryIdentityData) {}

  public async findUserById(id: string): Promise<IdentityUser | undefined> {
    return this.data.users.find((user) => user.id === id);
  }

  public async findTenantById(id: string): Promise<IdentityTenant | undefined> {
    return this.data.tenants.find((tenant) => tenant.id === id);
  }

  public async findMembership(
    tenantId: string,
    userId: string,
  ): Promise<IdentityMembership | undefined> {
    const found = this.data.memberships.find(
      (member) => member.tenantId === tenantId && member.userId === userId,
    );
    return found === undefined ? undefined : { role: found.role, status: found.status };
  }

  /** テストで Membership を削除するための操作 */
  public removeMembership(tenantId: string, userId: string): void {
    this.data = {
      ...this.data,
      memberships: this.data.memberships.filter(
        (member) => !(member.tenantId === tenantId && member.userId === userId),
      ),
    };
  }
}

export class MemoryProjectRepository implements ProjectRepository {
  private readonly projects: Map<string, Project>;

  constructor(initial: ReadonlyArray<Project> = []) {
    this.projects = new Map(initial.map((project) => [project.id, project]));
  }

  public async list(ctx: TenantContext): Promise<ReadonlyArray<Project>> {
    return [...this.projects.values()].filter((project) => project.tenantId === ctx.tenantId);
  }

  public async findById(ctx: TenantContext, id: string): Promise<Project | undefined> {
    const project = this.projects.get(id);
    return project !== undefined && project.tenantId === ctx.tenantId ? project : undefined;
  }

  public async create(ctx: TenantContext, input: { id: string; name: string }): Promise<Project> {
    const project: Project = {
      id: input.id,
      tenantId: ctx.tenantId,
      name: input.name,
      createdBy: ctx.userId,
    };
    this.projects.set(project.id, project);
    return project;
  }
}
