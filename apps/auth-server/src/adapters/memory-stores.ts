import { MemoryKeyValueStore, type Clock } from "@sandbox/shared";
import type { AuthStores } from "../ports/stores.ts";

/**
 * ローカル検証とテスト用。本番は Redis 実装に差し替える。
 */
export function createMemoryStores(clock: Clock): AuthStores {
  return {
    ssoSessions: new MemoryKeyValueStore(clock),
    sidIndex: new MemoryKeyValueStore(clock),
    authorizationRequests: new MemoryKeyValueStore(clock),
    authorizationCodes: new MemoryKeyValueStore(clock),
    refreshTokens: new MemoryKeyValueStore(clock),
    refreshTokenFamilies: new MemoryKeyValueStore(clock),
    csrfTokens: new MemoryKeyValueStore(clock),
  };
}
