/**
 * Identity DB へのアクセス。auth-server が所有する。
 * docs/design/05-data-model.md に対応する。
 *
 * サービス (OidcClient) とテナント (Tenant) は別の軸。テナントは顧客企業であり複数のサービスを契約できる。
 * 認可リクエストのテナントは登録済み redirect_uri から決める。
 */
export type UserStatus = "active" | "disabled";
export type TenantStatus = "active" | "suspended";
export type MembershipStatus = "active" | "invited" | "disabled";
export type ContractStatus = "active" | "suspended";
export type Role = "owner" | "admin" | "member" | "viewer";

export interface User {
  readonly id: string;
  readonly cognitoSub: string;
  readonly email: string;
  readonly name: string | null;
  readonly status: UserStatus;
}

export interface Tenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: TenantStatus;
}

/** 登録済みの戻り先。tenant が null の行はテナントに紐付かない戻り先 */
export interface RedirectTarget {
  readonly uri: string;
  readonly tenant: Tenant | null;
}

export interface OidcClient {
  readonly clientId: string;
  readonly clientSecretHash: string;
  readonly name: string;
  /** このサービスの API の識別子。Access Token の aud になる */
  readonly audience: string;
  readonly redirectTargets: ReadonlyArray<RedirectTarget>;
  readonly allowedScopes: ReadonlyArray<string>;
  readonly status: "active" | "disabled";
  /** Back-Channel Logout の通知先。未設定なら通知しない */
  readonly backchannelLogoutUri: string | null;
}

export interface Membership {
  readonly role: Role;
  readonly status: MembershipStatus;
}

export interface Contract {
  readonly status: ContractStatus;
}

export interface NewUser {
  readonly id: string;
  readonly cognitoSub: string;
  readonly email: string;
  readonly name: string | null;
}

/** ポータルに並べる、テナントごとの契約サービス */
export interface PortalService {
  readonly clientId: string;
  readonly name: string;
  /** そのテナント向けに登録された戻り先の origin。ログイン導線に使う */
  readonly origin: string;
}

export interface PortalEntry {
  readonly tenant: Tenant;
  readonly role: Role;
  readonly services: ReadonlyArray<PortalService>;
}

export interface IdentityRepository {
  findClient(clientId: string): Promise<OidcClient | undefined>;
  findUserByCognitoSub(cognitoSub: string): Promise<User | undefined>;
  findUserById(id: string): Promise<User | undefined>;
  createUser(user: NewUser): Promise<User>;
  findTenantById(id: string): Promise<Tenant | undefined>;
  findMembership(tenantId: string, userId: string): Promise<Membership | undefined>;
  findContract(tenantId: string, clientId: string): Promise<Contract | undefined>;
  /** ユーザーが active で所属する active なテナントと、そのテナントが契約中のサービス */
  listPortalEntries(userId: string): Promise<ReadonlyArray<PortalEntry>>;
}
