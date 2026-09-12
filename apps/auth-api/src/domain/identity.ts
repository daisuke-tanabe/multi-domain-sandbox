/**
 * Identity DB へのアクセス。auth-api が所有する。
 * docs/design/05-data-model.md に対応する。
 *
 * サービス (OidcClient) とテナント (Tenant) は別の軸。テナントは顧客企業であり複数のサービスを契約できる。
 * 認可リクエストのテナントは redirect_uri をサービスのテンプレートに当てて slug を取り出し、tenants から引く。
 * identity が持つのは「誰がどのテナントのどのサービスに入れるか」まで。役割と権限はサービスの DB が持つ。
 */
import type { ClientStatus, ContractStatus, TenantStatus, UserStatus } from "@sandbox/shared";

export interface User {
  readonly id: string;
  /** 招待直後は null。初回ログイン時にメールで照合して埋める */
  readonly cognitoSub: string | null;
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

export type ServiceMembershipStatus = "active" | "disabled";

/** テナント × サービスへの割り当て。役割は持たない */
export interface ServiceMembership {
  readonly status: ServiceMembershipStatus;
}

export interface ServiceMember {
  readonly user: User;
  readonly status: ServiceMembershipStatus;
}

export interface Contract {
  readonly status: ContractStatus;
}

export interface NewUser {
  readonly id: string;
  readonly cognitoSub: string | null;
  readonly email: string;
  readonly name: string | null;
}

/** ポータルに並べる、テナントごとに割り当てられたサービス */
export interface PortalService {
  readonly clientId: string;
  readonly name: string;
  /** そのテナント向けの redirect_uri から導いた origin。ログイン導線に使う */
  readonly origin: string;
}

export interface PortalEntry {
  readonly tenant: Tenant;
  readonly services: ReadonlyArray<PortalService>;
}
