import { expandRedirectUriTemplate } from "@sandbox/shared";
import type {
  Contract,
  IdentityRepository,
  NewUser,
  OidcClient,
  PortalEntry,
  ServiceMembership,
  Tenant,
  User,
} from "../ports/identity-repository.ts";

/**
 * テスト用のインメモリ Identity Repository。
 */
export interface MemoryIdentityData {
  readonly clients: ReadonlyArray<OidcClient>;
  readonly tenants: ReadonlyArray<Tenant>;
  readonly users: ReadonlyArray<User>;
  readonly contracts: ReadonlyArray<{ tenantId: string; oidcClientId: string } & Contract>;
  readonly serviceMemberships: ReadonlyArray<
    { tenantId: string; oidcClientId: string; userId: string } & ServiceMembership
  >;
}

export class MemoryIdentityRepository implements IdentityRepository {
  private readonly users: Map<string, User>;
  private memberships: MemoryIdentityData["serviceMemberships"];
  private contracts: MemoryIdentityData["contracts"];

  constructor(private readonly data: MemoryIdentityData) {
    this.users = new Map(data.users.map((user) => [user.id, user]));
    this.memberships = data.serviceMemberships;
    this.contracts = data.contracts;
  }

  public async findClient(clientId: string): Promise<OidcClient | undefined> {
    return this.data.clients.find((client) => client.clientId === clientId);
  }

  public async findUserByCognitoSub(cognitoSub: string): Promise<User | undefined> {
    return [...this.users.values()].find((user) => user.cognitoSub === cognitoSub);
  }

  public async findUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  public async createUser(user: NewUser): Promise<User> {
    const created: User = { ...user, status: "active" };
    this.users.set(created.id, created);
    return created;
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
      (member) =>
        member.tenantId === tenantId &&
        member.oidcClientId === oidcClientId &&
        member.userId === userId,
    );
    return found === undefined ? undefined : { role: found.role, status: found.status };
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
          return [{ clientId: client.clientId, name: client.name, role: membership.role, origin }];
        });
      if (services.length > 0) entries.push({ tenant, services });
    }
    return entries;
  }

  /** テストで割り当てを外すための操作。clientId は OAuth の client_id */
  public removeServiceMembership(tenantId: string, clientId: string, userId: string): void {
    const client = this.data.clients.find((c) => c.clientId === clientId);
    this.memberships = this.memberships.filter(
      (m) => !(m.tenantId === tenantId && m.oidcClientId === client?.id && m.userId === userId),
    );
  }

  /** テストで契約を解除するための操作。clientId は OAuth の client_id */
  public removeContract(tenantId: string, clientId: string): void {
    const client = this.data.clients.find((c) => c.clientId === clientId);
    this.contracts = this.contracts.filter(
      (contract) => !(contract.tenantId === tenantId && contract.oidcClientId === client?.id),
    );
  }
}
