import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createRedisClient, RedisKeyValueStore } from "./redis-store.ts";

/**
 * REDIS_URL が設定されているときだけ実行する結合テスト。
 * ローカルでは `pnpm db:up` で起動する redis に対して REDIS_URL=redis://127.0.0.1:6379 で走らせる。
 */
const redisUrl = process.env.REDIS_URL;

describe.skipIf(redisUrl === undefined)("RedisKeyValueStore", () => {
  const redis = redisUrl === undefined ? undefined : createRedisClient(redisUrl);
  const prefix = `test:${Date.now()}`;

  beforeAll(async () => {
    if (redis === undefined) return;
    await redis.ping();
  });

  afterAll(async () => {
    if (redis === undefined) return;
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  test("round-trips a JSON value with ttl", async () => {
    if (redis === undefined) return;
    const store = new RedisKeyValueStore<{ n: number }>(redis, prefix);

    await store.set("a", { n: 1 }, 60);
    const value = await store.get("a");
    const ttl = await redis.ttl(`${prefix}:a`);

    expect(value).toEqual({ n: 1 });
    expect(ttl).toBeGreaterThan(50);
  });

  test("getAndDelete returns the value exactly once", async () => {
    if (redis === undefined) return;
    const store = new RedisKeyValueStore<string>(redis, prefix);
    await store.set("code", "v", 60);

    const first = await store.getAndDelete("code");
    const second = await store.getAndDelete("code");

    expect(first).toBe("v");
    expect(second).toBeUndefined();
  });
});
