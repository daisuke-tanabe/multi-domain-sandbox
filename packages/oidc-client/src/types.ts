import type { Clock, CookiePolicy, KeyValueStore, Logger } from "@sandbox/shared";

/**
 * サービス単位の OIDC Client 設定。docs/design/06-oidc-client-design.md に対応する。
 * 1 サービス = 1 Client。テナントはホスト名から決まり、認可リクエストごとに redirect_uri で伝える。
 */
export interface ServiceConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes: ReadonlyArray<string>;
  /** このサービスの API。Access Token の aud と一致する */
  readonly apiBaseUrl: string;
  /** 表示名 */
  readonly name: string;
}

/**
 * リクエストのホストから解決した、サービス × テナントの設定。
 */
export interface OidcClientConfig extends ServiceConfig {
  readonly tenantSlug: string;
  readonly redirectUri: string;
}

export interface OidcProviderConfig {
  /** 公開 issuer。iss 検証とブラウザリダイレクトに使う */
  readonly issuer: string;
  /** サーバー間通信用の URL。DNS に依存しない。省略時は issuer */
  readonly backchannelBaseUrl?: string;
}

/**
 * Tenant Session。ブラウザには id を Cookie で渡すだけで、Token はサーバー側に閉じる。
 * clientId と tenantSlug の組でキー空間を分ける。
 */
export interface TenantSession {
  readonly id: string;
  readonly clientId: string;
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
  readonly clientId: string;
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
  /** Host ヘッダからサービス × テナントの設定を解決する。未知のホストは undefined */
  readonly resolveClient: (host: string | undefined) => OidcClientConfig | undefined;
  /** logout_token の aud からサービスを解決する。Back-Channel Logout は Host に依存しない */
  readonly resolveClientById: (clientId: string) => ServiceConfig | undefined;
  readonly sessions: KeyValueStore<TenantSession>;
  /** sid → Tenant Session ID の一覧。Back-Channel Logout で一括削除する */
  readonly sessionsBySid: KeyValueStore<ReadonlyArray<string>>;
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
