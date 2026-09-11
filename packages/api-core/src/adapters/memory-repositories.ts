import type {
  AccessContext,
  IdentityMembership,
  IdentityReader,
  IdentityTenant,
  IdentityUser,
} from "../ports/identity-reader.ts";
import type {
  PermissionOverride,
  PermissionReader,
  PermissionSubject,
} from "../ports/permission-reader.ts";
import type { Project, ProjectRepository, TenantContext } from "../ports/project-repository.ts";

/**
 * テスト用のインメモリ実装。
 */
export interface MemoryIdentityData {
  readonly users: ReadonlyArray<IdentityUser>;
  readonly tenants: ReadonlyArray<IdentityTenant>;
  /** clientId は OAuth の client_id */
  readonly serviceMemberships: ReadonlyArray<
    { tenantId: string; clientId: string; userId: string } & IdentityMembership
  >;
}

export class MemoryIdentityReader implements IdentityReader {
  constructor(private data: MemoryIdentityData) {}

  public async findAccessContext(
    userId: string,
    tenantId: string,
    clientId: string,
  ): Promise<AccessContext> {
    const membership = this.data.serviceMemberships.find(
      (m) => m.tenantId === tenantId && m.clientId === clientId && m.userId === userId,
    );
    return {
      user: this.data.users.find((user) => user.id === userId),
      tenant: this.data.tenants.find((tenant) => tenant.id === tenantId),
      membership:
        membership === undefined ? undefined : { role: membership.role, status: membership.status },
    };
  }

  /** テストで割り当てを外すための操作 */
  public removeServiceMembership(tenantId: string, clientId: string, userId: string): void {
    this.data = {
      ...this.data,
      serviceMemberships: this.data.serviceMemberships.filter(
        (m) => !(m.tenantId === tenantId && m.clientId === clientId && m.userId === userId),
      ),
    };
  }
}

export class MemoryPermissionReader implements PermissionReader {
  private overrides: Array<PermissionSubject & PermissionOverride>;

  constructor(initial: ReadonlyArray<PermissionSubject & PermissionOverride> = []) {
    this.overrides = [...initial];
  }

  public async listOverrides(
    subject: PermissionSubject,
  ): Promise<ReadonlyArray<PermissionOverride>> {
    return this.overrides
      .filter(
        (o) =>
          o.tenantId === subject.tenantId &&
          o.userId === subject.userId &&
          o.clientId === subject.clientId,
      )
      .map((o) => ({ permission: o.permission, effect: o.effect }));
  }

  /** テストで上書きを足すための操作 */
  public add(override: PermissionSubject & PermissionOverride): void {
    this.overrides.push(override);
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
