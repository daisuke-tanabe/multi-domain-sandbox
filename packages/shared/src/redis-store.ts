import { Redis } from "ioredis";
import type { CounterStore, KeyValueStore, SetStore } from "./kv-store.ts";

/**
 * Redis 実装。値は JSON で保存し、TTL は EX で指定する。
 * getAndDelete は GETDEL、setIfAbsent は SET NX でアトミックに行う。
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
    await this.redis.set(this.key(key), JSON.stringify(value), "EX", ttl(ttlSeconds));
  }

  public async update(key: string, value: T): Promise<boolean> {
    // KEEPTTL で寿命を引き継ぎ、XX で既存キーだけを書き換える
    const result = await this.redis.call(
      "SET",
      this.key(key),
      JSON.stringify(value),
      "KEEPTTL",
      "XX",
    );
    return result === "OK";
  }

  public async delete(key: string): Promise<void> {
    await this.redis.del(this.key(key));
  }

  public async getAndDelete(key: string): Promise<T | undefined> {
    const raw = await this.redis.getdel(this.key(key));
    return raw === null ? undefined : parse<T>(raw);
  }

  public async setIfAbsent(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(
      this.key(key),
      JSON.stringify(value),
      "EX",
      ttl(ttlSeconds),
      "NX",
    );
    return result === "OK";
  }
}

/**
 * Redis の Set。SADD / SREM は要素単位でアトミックなので、並行追加で要素が落ちない。
 */
export class RedisSetStore implements SetStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {}

  private key(key: string): string {
    return `${this.prefix}:${key}`;
  }

  public async add(key: string, member: string, ttlSeconds: number): Promise<void> {
    await this.redis
      .multi()
      .sadd(this.key(key), member)
      .expire(this.key(key), ttl(ttlSeconds))
      .exec();
  }

  public async remove(key: string, member: string): Promise<void> {
    await this.redis.srem(this.key(key), member);
  }

  public async members(key: string): Promise<ReadonlyArray<string>> {
    return this.redis.smembers(this.key(key));
  }

  public async delete(key: string): Promise<void> {
    await this.redis.del(this.key(key));
  }
}

export class RedisCounterStore implements CounterStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {}

  public async increment(key: string, ttlSeconds: number): Promise<number> {
    const full = `${this.prefix}:${key}`;
    const results = await this.redis.multi().incr(full).expire(full, ttl(ttlSeconds), "NX").exec();
    const count = results?.[0]?.[1];
    return typeof count === "number" ? count : Number(count ?? 0);
  }
}

function ttl(seconds: number): number {
  return Math.max(1, Math.ceil(seconds));
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
