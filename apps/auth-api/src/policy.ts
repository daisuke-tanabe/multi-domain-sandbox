/**
 * 寿命や制限の既定値。docs/design/03-cookie-design.md と 04-token-design.md に対応する。
 * 単位は秒。
 */
export const SSO_SESSION_IDLE_SECONDS = 2 * 60 * 60;
export const SSO_SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60;
export const AUTHORIZATION_REQUEST_TTL_SECONDS = 30 * 60;
export const AUTHORIZATION_CODE_TTL_SECONDS = 60;
/** 使用済み code を再利用検知のために保持する期間 */
export const CONSUMED_CODE_RETENTION_SECONDS = 10 * 60;
export const ID_TOKEN_TTL_SECONDS = 5 * 60;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 12 * 60 * 60;
export const CSRF_TOKEN_TTL_SECONDS = 30 * 60;

export const SUPPORTED_SCOPES: ReadonlyArray<string> = ["openid", "profile", "email"];

export const COOKIE_SSO_SESSION = "sso_session";
export const COOKIE_CSRF = "auth_csrf";
export const LOGOUT_TOKEN_TTL_SECONDS = 2 * 60;
