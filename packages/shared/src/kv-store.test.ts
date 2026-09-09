import { describe, expect, test } from "vitest";
import { FakeClock } from "./clock.ts";
import { MemoryKeyValueStore } from "./kv-store.ts";

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

  test("getAndDelete consumes the value exactly once", async () => {
    // Arrange
    const store = new MemoryKeyValueStore<string>(new FakeClock(0));
    await store.set("code", "v", 60);

    // Act
    const first = await store.getAndDelete("code");
    const second = await store.getAndDelete("code");

    // Assert
    expect(first).toBe("v");
    expect(second).toBeUndefined();
  });
});
