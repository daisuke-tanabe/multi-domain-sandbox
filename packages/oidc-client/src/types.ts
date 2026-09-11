import type {
  Clock,
  CookiePolicy,
  CounterStore,
  FetchLike,
  KeyValueStore,
  Logger,
  SetStore,
} from "@sandbox/shared";

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
 * 1 プロセス 1 サービスなので、キー空間はテナントで分ける。
 */
export interface TenantSession {
  readonly id: string;
  readonly tenantSlug: string;
  readonly userId: string;
  readonly tenantId: string;
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
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
}

export interface OidcClientDeps {
  readonly provider: OidcProviderConfig;
  /** Host ヘッダからサービス × テナントの設定を解決する。未知のホストは undefined */
  readonly resolveClient: (host: string | undefined) => OidcClientConfig | undefined;
  /** logout_token の aud からサービスを解決する。Back-Channel Logout は Host に依存しない */
  readonly resolveClientById: (clientId: string) => ServiceConfig | undefined;
  readonly sessions: KeyValueStore<TenantSession>;
  /** sid → Tenant Session のキー集合。Back-Channel Logout で一括削除する */
  readonly sessionsBySid: SetStore;
  readonly preAuth: KeyValueStore<PreAuthState>;
  /** セッション単位の Refresh ロック。同時リクエストで Refresh Token を二重に使わない */
  readonly refreshLocks: KeyValueStore<string>;
  /** /auth/* のレート制限 */
  readonly rateLimits: CounterStore;
  /** ロック待ちの sleep。テストでは即時に返す */
  readonly sleep: (ms: number) => Promise<void>;
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
/** Refresh ロックの寿命。Auth Server が応答しなくてもこの秒数で解ける */
export const REFRESH_LOCK_TTL_SECONDS = 10;
/** /auth/* のレート制限。固定窓の回数 */
export const AUTH_ROUTE_RATE_LIMIT = { limit: 60, windowSeconds: 60 } as const;

export const COOKIE_SESSION = "tenant_session";
export const COOKIE_PRE_AUTH = "tenant_pre_auth";
