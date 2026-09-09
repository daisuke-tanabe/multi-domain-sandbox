import type {
  IdentityRepository,
  Membership,
  NewUser,
  OidcClient,
  TenantMembershipView,
  User,
} from "../ports/identity-repository.ts";

/**
 * テスト用のインメモリ Identity Repository。
 */
export interface MemoryIdentityData {
  readonly clients: ReadonlyArray<OidcClient>;
  readonly users: ReadonlyArray<User>;
  readonly memberships: ReadonlyArray<{ tenantId: string; userId: string } & Membership>;
}

export class MemoryIdentityRepository implements IdentityRepository {
  private readonly users: Map<string, User>;

  constructor(private readonly data: MemoryIdentityData) {
    this.users = new Map(data.users.map((user) => [user.id, user]));
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

  public async listTenantsForUser(userId: string): Promise<ReadonlyArray<TenantMembershipView>> {
    return this.data.memberships
      .filter((member) => member.userId === userId && member.status === "active")
      .flatMap((member) => {
        const client = this.data.clients.find(
          (candidate) => candidate.tenant?.id === member.tenantId,
        );
        const tenant = client?.tenant;
        if (tenant === undefined || tenant === null || tenant.status !== "active") return [];
        return [
          {
            tenant,
            tenantName: `Tenant ${tenant.slug}`,
            role: member.role,
            redirectUri: client?.redirectUris[0] ?? null,
          },
        ];
      });
  }

  public async findMembership(tenantId: string, userId: string): Promise<Membership | undefined> {
    const found = this.data.memberships.find(
      (member) => member.tenantId === tenantId && member.userId === userId,
    );
    return found === undefined ? undefined : { role: found.role, status: found.status };
  }
}
