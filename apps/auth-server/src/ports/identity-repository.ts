/**
 * Identity DB へのアクセス。auth-server が所有する。
 * docs/design/05-data-model.md に対応する。
 */
export type UserStatus = "active" | "disabled";
export type TenantStatus = "active" | "suspended";
export type MembershipStatus = "active" | "invited" | "disabled";
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
  readonly status: TenantStatus;
}

export interface OidcClient {
  readonly clientId: string;
  readonly clientSecretHash: string;
  readonly redirectUris: ReadonlyArray<string>;
  readonly allowedScopes: ReadonlyArray<string>;
  readonly status: "active" | "disabled";
  /** テナント用 Client のみ持つ。別ドメインサービスや管理画面は null */
  readonly tenant: Tenant | null;
  /** Back-Channel Logout の通知先。未設定なら通知しない */
  readonly backchannelLogoutUri: string | null;
}

export interface Membership {
  readonly role: Role;
  readonly status: MembershipStatus;
}

export interface NewUser {
  readonly id: string;
  readonly cognitoSub: string;
  readonly email: string;
  readonly name: string | null;
}

export interface IdentityRepository {
  findClient(clientId: string): Promise<OidcClient | undefined>;
  findUserByCognitoSub(cognitoSub: string): Promise<User | undefined>;
  findUserById(id: string): Promise<User | undefined>;
  createUser(user: NewUser): Promise<User>;
  findMembership(tenantId: string, userId: string): Promise<Membership | undefined>;
  /** ポータル用。ユーザーが active で所属する active なテナントと、そのテナント用 Client の redirect_uri */
  listTenantsForUser(userId: string): Promise<ReadonlyArray<TenantMembershipView>>;
}

export interface TenantMembershipView {
  readonly tenant: Tenant;
  readonly tenantName: string;
  readonly role: Role;
  /** テナント用 Client の登録 redirect_uri。Client 未登録なら null */
  readonly redirectUri: string | null;
}
