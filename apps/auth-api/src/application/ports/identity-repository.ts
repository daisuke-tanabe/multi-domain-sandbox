/**
 * Identity DB へのアクセスの port。実装は infrastructure の pg / memory
 */
import type {
  MfaMethod,
  UserMfaMethod,
  Contract,
  NewUser,
  OidcClient,
  PortalEntry,
  ServiceMember,
  ServiceMembership,
  Tenant,
  User,
} from "../../domain/identity.ts";

export interface IdentityRepository {
  findClient(clientId: string): Promise<OidcClient | undefined>;
  /** OidcClient.id で引く。auth_session_clients の参照先 */
  findClientById(id: string): Promise<OidcClient | undefined>;
  listClients(): Promise<ReadonlyArray<OidcClient>>;
  findUserByCognitoSub(cognitoSub: string): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  findUserById(id: string): Promise<User | undefined>;
  createUser(user: NewUser): Promise<User>;
  /** 招待で事前作成したユーザーに、初回ログイン時の Cognito の sub を紐付ける */
  linkCognitoSub(userId: string, cognitoSub: string): Promise<User>;
  findTenantById(id: string): Promise<Tenant | undefined>;
  findTenantBySlug(slug: string): Promise<Tenant | undefined>;
  findTenantsByIds(ids: ReadonlyArray<string>): Promise<ReadonlyArray<Tenant>>;
  /** oidcClientId は OidcClient.id */
  findContract(tenantId: string, oidcClientId: string): Promise<Contract | undefined>;
  findServiceMembership(
    tenantId: string,
    oidcClientId: string,
    userId: string,
  ): Promise<ServiceMembership | undefined>;
  /** 割り当てを作る。既にあれば active に戻す */
  upsertServiceMembership(tenantId: string, oidcClientId: string, userId: string): Promise<void>;
  removeServiceMembership(tenantId: string, oidcClientId: string, userId: string): Promise<void>;
  listServiceMembers(tenantId: string, oidcClientId: string): Promise<ReadonlyArray<ServiceMember>>;
  /** ユーザーが active で割り当てられている、active な契約のサービスをテナントごとにまとめる */
  listPortalEntries(userId: string): Promise<ReadonlyArray<PortalEntry>>;
  listMfaMethods(userId: string): Promise<ReadonlyArray<UserMfaMethod>>;
  /** 登録済みの方式を記録する。既にあれば何もしない */
  recordMfaMethod(userId: string, method: MfaMethod, enrolledAt: number): Promise<void>;
}
