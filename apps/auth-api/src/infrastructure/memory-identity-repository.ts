import { expandRedirectUriTemplate } from "@sandbox/shared";
import type {
  Contract,
  NewUser,
  OidcClient,
  PortalEntry,
  ServiceMember,
  ServiceMembership,
  Tenant,
  User,
} from "../domain/identity.ts";
import type { IdentityRepository } from "../application/ports/identity-repository.ts";

type MembershipRow = { tenantId: string; oidcClientId: string; userId: string } & ServiceMembership;

/**
 * テスト用のインメモリ Identity Repository。
 */
export interface MemoryIdentityData {
  readonly clients: ReadonlyArray<OidcClient>;
  readonly tenants: ReadonlyArray<Tenant>;
  readonly users: ReadonlyArray<User>;
  readonly contracts: ReadonlyArray<{ tenantId: string; oidcClientId: string } & Contract>;
  readonly serviceMemberships: ReadonlyArray<MembershipRow>;
}

export class MemoryIdentityRepository implements IdentityRepository {
  private readonly users: Map<string, User>;
  private memberships: MembershipRow[];
  private contracts: MemoryIdentityData["contracts"];

  constructor(private readonly data: MemoryIdentityData) {
    this.users = new Map(data.users.map((user) => [user.id, user]));
    this.memberships = [...data.serviceMemberships];
    this.contracts = data.contracts;
  }

  public async findClient(clientId: string): Promise<OidcClient | undefined> {
    return this.data.clients.find((client) => client.clientId === clientId);
  }

  public async listClients(): Promise<ReadonlyArray<OidcClient>> {
    return this.data.clients;
  }

  public async findUserByCognitoSub(cognitoSub: string): Promise<User | undefined> {
    return [...this.users.values()].find((user) => user.cognitoSub === cognitoSub);
  }

  public async findUserByEmail(email: string): Promise<User | undefined> {
    const lower = email.toLowerCase();
    return [...this.users.values()].find((user) => user.email.toLowerCase() === lower);
  }

  public async findUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  public async createUser(user: NewUser): Promise<User> {
    const created: User = { ...user, status: "active" };
    this.users.set(created.id, created);
    return created;
  }

  public async linkCognitoSub(userId: string, cognitoSub: string): Promise<User> {
    const user = this.users.get(userId);
    if (user === undefined) throw new Error(`user ${userId} not found`);
    const linked: User = { ...user, cognitoSub };
    this.users.set(userId, linked);
    return linked;
  }

  public async findTenantById(id: string): Promise<Tenant | undefined> {
    return this.data.tenants.find((tenant) => tenant.id === id);
  }

  public async findTenantBySlug(slug: string): Promise<Tenant | undefined> {
    return this.data.tenants.find((tenant) => tenant.slug === slug);
  }

  public async findContract(tenantId: string, oidcClientId: string): Promise<Contract | undefined> {
    const found = this.contracts.find(
      (contract) => contract.tenantId === tenantId && contract.oidcClientId === oidcClientId,
    );
    return found === undefined ? undefined : { status: found.status };
  }

  public async findServiceMembership(
    tenantId: string,
    oidcClientId: string,
    userId: string,
  ): Promise<ServiceMembership | undefined> {
    const found = this.memberships.find(
      (m) => m.tenantId === tenantId && m.oidcClientId === oidcClientId && m.userId === userId,
    );
    return found === undefined ? undefined : { status: found.status };
  }

  public async upsertServiceMembership(
    tenantId: string,
    oidcClientId: string,
    userId: string,
  ): Promise<void> {
    this.memberships = this.memberships.filter(
      (m) => !(m.tenantId === tenantId && m.oidcClientId === oidcClientId && m.userId === userId),
    );
    this.memberships.push({ tenantId, oidcClientId, userId, status: "active" });
  }

  public async removeServiceMembership(
    tenantId: string,
    oidcClientId: string,
    userId: string,
  ): Promise<void> {
    this.memberships = this.memberships.filter(
      (m) => !(m.tenantId === tenantId && m.oidcClientId === oidcClientId && m.userId === userId),
    );
  }

  public async listServiceMembers(
    tenantId: string,
    oidcClientId: string,
  ): Promise<ReadonlyArray<ServiceMember>> {
    return this.memberships
      .filter((m) => m.tenantId === tenantId && m.oidcClientId === oidcClientId)
      .flatMap((m) => {
        const user = this.users.get(m.userId);
        return user === undefined ? [] : [{ user, status: m.status }];
      });
  }

  public async listPortalEntries(userId: string): Promise<ReadonlyArray<PortalEntry>> {
    const entries: PortalEntry[] = [];
    for (const tenant of this.data.tenants) {
      if (tenant.status !== "active") continue;
      const services = this.memberships
        .filter((m) => m.userId === userId && m.tenantId === tenant.id && m.status === "active")
        .flatMap((membership) => {
          const contract = this.contracts.find(
            (c) => c.tenantId === tenant.id && c.oidcClientId === membership.oidcClientId,
          );
          const client = this.data.clients.find((c) => c.id === membership.oidcClientId);
          if (contract?.status !== "active" || client?.status !== "active") return [];
          const origin = new URL(expandRedirectUriTemplate(client.redirectUriTemplate, tenant.slug))
            .origin;
          return [{ clientId: client.clientId, name: client.name, origin }];
        });
      if (services.length > 0) entries.push({ tenant, services });
    }
    return entries;
  }

  /** テストで契約を解除するための操作。clientId は OAuth の client_id */
  public removeContract(tenantId: string, clientId: string): void {
    const client = this.data.clients.find((c) => c.clientId === clientId);
    this.contracts = this.contracts.filter(
      (contract) => !(contract.tenantId === tenantId && contract.oidcClientId === client?.id),
    );
  }

  /** テストで割り当てを外す。clientId は OAuth の client_id */
  public dropServiceMembership(tenantId: string, clientId: string, userId: string): void {
    const client = this.data.clients.find((c) => c.clientId === clientId);
    if (client !== undefined) void this.removeServiceMembership(tenantId, client.id, userId);
  }
}
