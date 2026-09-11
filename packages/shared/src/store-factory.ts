import type { Clock } from "./clock.ts";
import { MemoryKeyValueStore, type KeyValueStore } from "./kv-store.ts";
import type { Logger } from "./logger.ts";
import { createRedisClient, RedisKeyValueStore } from "./redis-store.ts";

export type StoreFactory = <T>(prefix: string) => KeyValueStore<T>;

/**
 * REDIS_URL があれば Redis、なければインメモリのストアを作る。
 * ストアの名前空間はプレフィックスで分け、呼び出し側は実装を意識しない。
 */
export function createStoreFactory(input: {
  readonly redisUrl: string | undefined;
  readonly clock: Clock;
  readonly logger: Logger;
}): StoreFactory {
  if (input.redisUrl === undefined) {
    input.logger.warn("REDIS_URL is not set. Sessions are kept in memory and lost on restart");
    return <T>() => new MemoryKeyValueStore<T>(input.clock);
  }
  const redis = createRedisClient(input.redisUrl);
  return <T>(prefix: string) => new RedisKeyValueStore<T>(redis, prefix);
}
