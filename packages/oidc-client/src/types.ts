import type { Clock, CookiePolicy, KeyValueStore, Logger } from "@sandbox/shared";

/**
 * Tenant Web Application 向け OIDC Client の設定。docs/design/06-oidc-client-design.md に対応する。
 * 1 テナント = 1 Client。ホストごとに解決する。
 */
export interface OidcClientConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly scopes: ReadonlyArray<string>;
  /** テナント slug。セッションストアのキー空間を分けるために使う */
  readonly tenantSlug: string;
}

export interface OidcProviderConfig {
  /** 公開 issuer。iss 検証とブラウザリダイレクトに使う */
  readonly issuer: string;
  /** サーバー間通信用の URL。DNS に依存しない。省略時は issuer */
  readonly backchannelBaseUrl?: string;
}

/**
 * Tenant Session。ブラウザには id を Cookie で渡すだけで、Token はサーバー側に閉じる。
 */
export interface TenantSession {
  readonly id: string;
  readonly tenantSlug: string;
  readonly userId: string;
  readonly tenantId: string | null;
  readonly sid: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
  readonly refreshToken: string;
  /** Logout フォーム用の同期トークン */
  readonly csrfToken: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
}

export interface PreAuthState {
  readonly id: string;
  readonly tenantSlug: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
  readonly createdAt: number;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface OidcClientDeps {
  readonly provider: OidcProviderConfig;
  /** Host ヘッダから Client 設定を解決する。未知のホストは undefined */
  readonly resolveClient: (host: string | undefined) => OidcClientConfig | undefined;
  /** logout_token の aud から Client を解決する。Back-Channel Logout は Host に依存しない */
  readonly resolveClientById: (clientId: string) => OidcClientConfig | undefined;
  /** sid → Tenant Session ID の一覧。Back-Channel Logout で一括削除する */
  readonly sessionsBySid: KeyValueStore<ReadonlyArray<string>>;
  readonly sessions: KeyValueStore<TenantSession>;
  readonly preAuth: KeyValueStore<PreAuthState>;
  readonly clock: Clock;
  readonly cookiePolicy: CookiePolicy;
  readonly logger: Logger;
  /** テストで差し替えるための fetch */
  readonly fetch: FetchLike;
}

export const SESSION_IDLE_SECONDS = 30 * 60;
export const SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60;
export const PRE_AUTH_TTL_SECONDS = 30 * 60;
/** Access Token の残り寿命がこれ未満なら先に更新する */
export const ACCESS_TOKEN_REFRESH_MARGIN_SECONDS = 60;

export const COOKIE_SESSION = "tenant_session";
export const COOKIE_PRE_AUTH = "tenant_pre_auth";
