import type { StoreFactory } from "@sandbox/shared";
import type { AuthStores } from "../ports/stores.ts";

/**
 * docs/design/05-data-model.md のキー設計に対応する。実装はインメモリでも Redis でも同じ。
 */
export function createAuthStores(store: StoreFactory): AuthStores {
  return {
    ssoSessions: store("sso:sess"),
    sidIndex: store("sso:sid"),
    authorizationRequests: store("sso:authreq"),
    authorizationCodes: store("sso:code"),
    refreshTokens: store("sso:rt"),
    refreshTokenFamilies: store("sso:rtfamily"),
    csrfTokens: store("sso:csrf"),
    sidRefreshFamilies: store("sso:sidrt"),
  };
}
