import { Redis } from "ioredis";
import type { KeyValueStore } from "./kv-store.ts";

/**
 * Redis 実装。値は JSON で保存し、TTL は EX で指定する。
 * getAndDelete は GETDEL でアトミックに行い、Authorization Code の二重交換を排除する。
 */
export class RedisKeyValueStore<T> implements KeyValueStore<T> {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {}

  private key(key: string): string {
    return `${this.prefix}:${key}`;
  }

  public async get(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.key(key));
    return raw === null ? undefined : parse<T>(raw);
  }

  public async set(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.key(key), JSON.stringify(value), "EX", Math.max(1, ttlSeconds));
  }

  public async delete(key: string): Promise<void> {
    await this.redis.del(this.key(key));
  }

  public async getAndDelete(key: string): Promise<T | undefined> {
    const raw = await this.redis.getdel(this.key(key));
    return raw === null ? undefined : parse<T>(raw);
  }
}

function parse<T>(raw: string): T {
  // 保存時に JSON.stringify した値のみが入る前提。壊れていれば例外にして気付けるようにする
  return JSON.parse(raw) as T;
}

/**
 * ioredis クライアントを作る。接続失敗時に無限再試行しないよう上限を付ける。
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
  });
}
