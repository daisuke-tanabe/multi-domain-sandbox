import { expandRedirectUriTemplate } from "@sandbox/shared";
import type {
  Contract,
  IdentityRepository,
  Membership,
  NewUser,
  OidcClient,
  PortalEntry,
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
  readonly memberships: ReadonlyArray<{ tenantId: string; userId: string } & Membership>;
  readonly contracts: ReadonlyArray<{ tenantId: string; oidcClientId: string } & Contract>;
}

export class MemoryIdentityRepository implements IdentityRepository {
  private readonly users: Map<string, User>;
  private memberships: MemoryIdentityData["memberships"];
  private contracts: MemoryIdentityData["contracts"];

  constructor(private readonly data: MemoryIdentityData) {
    this.users = new Map(data.users.map((user) => [user.id, user]));
    this.memberships = data.memberships;
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

  public async findMembership(tenantId: string, userId: string): Promise<Membership | undefined> {
    const found = this.memberships.find(
      (member) => member.tenantId === tenantId && member.userId === userId,
    );
    return found === undefined ? undefined : { role: found.role, status: found.status };
  }

  public async findContract(tenantId: string, oidcClientId: string): Promise<Contract | undefined> {
    const found = this.contracts.find(
      (contract) => contract.tenantId === tenantId && contract.oidcClientId === oidcClientId,
    );
    return found === undefined ? undefined : { status: found.status };
  }

  public async listPortalEntries(userId: string): Promise<ReadonlyArray<PortalEntry>> {
    return this.memberships
      .filter((member) => member.userId === userId && member.status === "active")
      .flatMap((member) => {
        const tenant = this.data.tenants.find((candidate) => candidate.id === member.tenantId);
        if (tenant === undefined || tenant.status !== "active") return [];
        const services = this.contracts
          .filter((contract) => contract.tenantId === tenant.id && contract.status === "active")
          .flatMap((contract) => {
            const client = this.data.clients.find((c) => c.id === contract.oidcClientId);
            if (client === undefined || client.status !== "active") return [];
            const origin = new URL(
              expandRedirectUriTemplate(client.redirectUriTemplate, tenant.slug),
            ).origin;
            return [{ clientId: client.clientId, name: client.name, origin }];
          });
        return [{ tenant, role: member.role, services }];
      });
  }

  /** テストで Membership を削除するための操作 */
  public removeMembership(tenantId: string, userId: string): void {
    this.memberships = this.memberships.filter(
      (member) => !(member.tenantId === tenantId && member.userId === userId),
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
