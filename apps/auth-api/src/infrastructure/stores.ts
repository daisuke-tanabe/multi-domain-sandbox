import type { StoreFactory } from "@sandbox/shared";
import type { AuthStores } from "../application/ports/stores.ts";

/**
 * docs/design/05-data-model.md のキー設計に対応する。実装はインメモリでも Redis でも同じ。
 */
export function createAuthStores(store: StoreFactory): AuthStores {
  return {
    ssoSessions: store.kv("sso:sess"),
    sidIndex: store.kv("sso:sid"),
    authorizationRequests: store.kv("sso:authreq"),
    authorizationCodes: store.kv("sso:code"),
    refreshTokens: store.kv("sso:rt"),
    refreshTokenFamilies: store.set("sso:rtfamily"),
    csrfTokens: store.kv("sso:csrf"),
    mfaPending: store.kv("sso:mfa"),
    sidRefreshFamilies: store.set("sso:sidrt"),
    rateLimits: store.counter("sso:ratelimit"),
  };
}
