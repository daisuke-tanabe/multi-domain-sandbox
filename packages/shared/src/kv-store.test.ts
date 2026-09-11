import { describe, expect, test } from "vitest";
import { FakeClock } from "./clock.ts";
import { MemoryCounterStore, MemoryKeyValueStore, MemorySetStore } from "./kv-store.ts";

describe("MemoryKeyValueStore", () => {
  test("returns undefined after ttl elapses", async () => {
    // Arrange
    const clock = new FakeClock(1000);
    const store = new MemoryKeyValueStore<string>(clock);
    await store.set("k", "v", 60);

    // Act
    clock.advance(60);
    const value = await store.get("k");

    // Assert
    expect(value).toBeUndefined();
  });

  test("getAndDelete consumes the value exactly once even when called concurrently", async () => {
    // Arrange
    const store = new MemoryKeyValueStore<string>(new FakeClock(0));
    await store.set("code", "v", 60);

    // Act
    const [first, second] = await Promise.all([
      store.getAndDelete("code"),
      store.getAndDelete("code"),
    ]);

    // Assert
    expect([first, second].filter((v) => v === "v")).toHaveLength(1);
  });

  test("setIfAbsent acquires a lock only once until it expires", async () => {
    const clock = new FakeClock(0);
    const store = new MemoryKeyValueStore<string>(clock);

    expect(await store.setIfAbsent("lock", "a", 10)).toBe(true);
    expect(await store.setIfAbsent("lock", "b", 10)).toBe(false);
    clock.advance(10);
    expect(await store.setIfAbsent("lock", "c", 10)).toBe(true);
  });
});

describe("MemorySetStore", () => {
  test("keeps every member added concurrently and removes members individually", async () => {
    const store = new MemorySetStore(new FakeClock(0));

    await Promise.all([store.add("s", "a", 60), store.add("s", "b", 60), store.add("s", "c", 60)]);
    await store.remove("s", "b");

    expect([...(await store.members("s"))].sort()).toEqual(["a", "c"]);
  });
});

describe("MemoryCounterStore", () => {
  test("counts within the window and resets after it", async () => {
    const clock = new FakeClock(0);
    const store = new MemoryCounterStore(clock);

    expect(await store.increment("ip", 60)).toBe(1);
    expect(await store.increment("ip", 60)).toBe(2);
    clock.advance(60);
    expect(await store.increment("ip", 60)).toBe(1);
  });
});
