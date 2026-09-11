import { RedisKeyValueStore, type createRedisClient } from "@sandbox/shared";
import type { AuthStores } from "../ports/stores.ts";

type Redis = ReturnType<typeof createRedisClient>;

/**
 * 本番用。docs/design/05-data-model.md のキー設計に対応する。
 */
export function createRedisStores(redis: Redis): AuthStores {
  return {
    ssoSessions: new RedisKeyValueStore(redis, "sso:sess"),
    sidIndex: new RedisKeyValueStore(redis, "sso:sid"),
    authorizationRequests: new RedisKeyValueStore(redis, "sso:authreq"),
    authorizationCodes: new RedisKeyValueStore(redis, "sso:code"),
    refreshTokens: new RedisKeyValueStore(redis, "sso:rt"),
    refreshTokenFamilies: new RedisKeyValueStore(redis, "sso:rtfamily"),
    csrfTokens: new RedisKeyValueStore(redis, "sso:csrf"),
    sidRefreshFamilies: new RedisKeyValueStore(redis, "sso:sidrt"),
  };
}
