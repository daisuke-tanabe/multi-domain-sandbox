import { describe, expect, test } from "vitest";
import { FakeClock } from "./clock.ts";
import { RemoteJwksSource } from "./jwks.ts";

describe("RemoteJwksSource", () => {
  const jwks = (kid: string) => JSON.stringify({ keys: [{ kid, kty: "RSA" }] });

  test("a forced refresh right after a normal fetch is allowed once, then throttled", async () => {
    const clock = new FakeClock(1_000);
    const served = [jwks("k1"), jwks("k2"), jwks("k3")];
    let calls = 0;
    const source = new RemoteJwksSource(
      "http://auth/jwks",
      async () => new Response(served[Math.min(calls++, 2)], { status: 200 }),
      clock,
    );

    const first = await source.get({ forceRefresh: false });
    clock.advance(20);
    const forced = await source.get({ forceRefresh: true });
    clock.advance(20);
    const throttled = await source.get({ forceRefresh: true });
    clock.advance(60);
    const again = await source.get({ forceRefresh: true });

    expect(first.ok && first.value.keys[0]?.kid).toBe("k1");
    expect(forced.ok && forced.value.keys[0]?.kid).toBe("k2");
    expect(throttled.ok && throttled.value.keys[0]?.kid).toBe("k2");
    expect(again.ok && again.value.keys[0]?.kid).toBe("k3");
  });

  test("concurrent gets share one fetch", async () => {
    let calls = 0;
    const source = new RemoteJwksSource(
      "http://auth/jwks",
      async () => {
        calls += 1;
        return new Response(jwks("k1"), { status: 200 });
      },
      new FakeClock(0),
    );

    await Promise.all([source.get({ forceRefresh: false }), source.get({ forceRefresh: false })]);

    expect(calls).toBe(1);
  });
});
