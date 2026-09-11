import type { Clock } from "./clock.ts";
import {
  MemoryCounterStore,
  MemoryKeyValueStore,
  MemorySetStore,
  type CounterStore,
  type KeyValueStore,
  type SetStore,
} from "./kv-store.ts";
import type { Logger } from "./logger.ts";
import {
  createRedisClient,
  RedisCounterStore,
  RedisKeyValueStore,
  RedisSetStore,
} from "./redis-store.ts";

export interface StoreFactory {
  kv<T>(prefix: string): KeyValueStore<T>;
  set(prefix: string): SetStore;
  counter(prefix: string): CounterStore;
}

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
    return createMemoryStoreFactory(input.clock);
  }
  const redis = createRedisClient(input.redisUrl);
  return {
    kv: <T>(prefix: string) => new RedisKeyValueStore<T>(redis, prefix),
    set: (prefix) => new RedisSetStore(redis, prefix),
    counter: (prefix) => new RedisCounterStore(redis, prefix),
  };
}

/** テストとローカル用 */
export function createMemoryStoreFactory(clock: Clock): StoreFactory {
  return {
    kv: <T>() => new MemoryKeyValueStore<T>(clock),
    set: () => new MemorySetStore(clock),
    counter: () => new MemoryCounterStore(clock),
  };
}
