export { OidcProvider } from "./provider.ts";
export type { Discovery, TokenResponse, ProviderError } from "./provider.ts";
export { oidcRoutes, readSessionCookie, clearSessionCookie } from "./routes.ts";
export type { OidcRouteHooks } from "./routes.ts";
export { tenantContext, requireSession } from "./middleware.ts";
export type { OidcEnv, OidcVariables } from "./middleware.ts";
export {
  loadSession,
  createSession,
  saveSession,
  destroySession,
  destroySessionsBySid,
} from "./session.ts";
export { apiFetch, ensureFreshAccessToken } from "./api-client.ts";
export type { ApiAccessError } from "./api-client.ts";
export {
  SESSION_IDLE_SECONDS,
  SESSION_ABSOLUTE_SECONDS,
  PRE_AUTH_TTL_SECONDS,
  ACCESS_TOKEN_REFRESH_MARGIN_SECONDS,
  COOKIE_SESSION,
  COOKIE_PRE_AUTH,
} from "./types.ts";
export type {
  ServiceConfig,
  OidcClientConfig,
  OidcProviderConfig,
  OidcClientDeps,
  TenantSession,
  PreAuthState,
  FetchLike,
} from "./types.ts";
