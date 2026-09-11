/**
 * Identity DB へのアクセス。auth-api が所有する。
 * docs/design/05-data-model.md に対応する。
 *
 * サービス (OidcClient) とテナント (Tenant) は別の軸。テナントは顧客企業であり複数のサービスを契約できる。
 * 認可リクエストのテナントは redirect_uri をサービスのテンプレートに当てて slug を取り出し、tenants から引く。
 */
import type {
  ClientStatus,
  ContractStatus,
  MembershipStatus,
  Role,
  TenantStatus,
  UserStatus,
} from "@sandbox/shared";

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

export interface OidcClient {
  /** 内部参照用のサロゲート ID。契約や secret はこれで紐付く */
  readonly id: string;
  /** OAuth の公開識別子 */
  readonly clientId: string;
  readonly name: string;
  /** このサービスの API の識別子。Access Token の aud になる */
  readonly audience: string;
  /** {tenant} を含む redirect_uri。展開後の完全一致で検証する */
  readonly redirectUriTemplate: string;
  /** 有効な client_secret のハッシュ。ローテーション中は複数 */
  readonly secretHashes: ReadonlyArray<string>;
  readonly allowedScopes: ReadonlyArray<string>;
  readonly status: ClientStatus;
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
  /** そのテナント向けの redirect_uri から導いた origin。ログイン導線に使う */
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
  findTenantBySlug(slug: string): Promise<Tenant | undefined>;
  findMembership(tenantId: string, userId: string): Promise<Membership | undefined>;
  /** oidcClientId は OidcClient.id */
  findContract(tenantId: string, oidcClientId: string): Promise<Contract | undefined>;
  /** ユーザーが active で所属する active なテナントと、そのテナントが契約中のサービス */
  listPortalEntries(userId: string): Promise<ReadonlyArray<PortalEntry>>;
}
