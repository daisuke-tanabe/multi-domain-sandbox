import { describe, expect, test } from "vitest";
import { generateSigningKey, signJwt, toJwks, verifyJwt } from "./jwt.ts";

const ISSUER = "https://auth.example.test";

describe("jwt", () => {
  test("verifies token signed with published JWKS key", async () => {
    // Arrange
    const key = await generateSigningKey();
    const now = 1_700_000_000;
    const token = await signJwt(key, {
      issuer: ISSUER,
      audience: "tenant-a",
      subject: "user-1",
      issuedAt: now,
      expiresAt: now + 300,
      claims: { nonce: "n1", tenant_id: "t1" },
    });

    // Act
    const result = await verifyJwt(token, toJwks([key]), {
      issuer: ISSUER,
      audience: "tenant-a",
      currentDate: new Date(now * 1000),
    });

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sub).toBe("user-1");
    expect(result.value.nonce).toBe("n1");
    expect(result.value.tenant_id).toBe("t1");
  });

  test("rejects token whose audience does not match", async () => {
    const key = await generateSigningKey();
    const now = 1_700_000_000;
    const token = await signJwt(key, {
      issuer: ISSUER,
      audience: "tenant-a",
      subject: "user-1",
      issuedAt: now,
      expiresAt: now + 300,
      claims: {},
    });

    const result = await verifyJwt(token, toJwks([key]), {
      issuer: ISSUER,
      audience: "https://api.example.test",
      currentDate: new Date(now * 1000),
    });

    expect(result.ok).toBe(false);
  });

  test("rejects expired token beyond clock tolerance", async () => {
    const key = await generateSigningKey();
    const now = 1_700_000_000;
    const token = await signJwt(key, {
      issuer: ISSUER,
      audience: "tenant-a",
      subject: "user-1",
      issuedAt: now,
      expiresAt: now + 300,
      claims: {},
    });

    const result = await verifyJwt(token, toJwks([key]), {
      issuer: ISSUER,
      audience: "tenant-a",
      currentDate: new Date((now + 400) * 1000),
    });

    expect(result.ok).toBe(false);
  });

  test("rejects token signed by a key absent from JWKS", async () => {
    const signer = await generateSigningKey();
    const other = await generateSigningKey();
    const now = 1_700_000_000;
    const token = await signJwt(signer, {
      issuer: ISSUER,
      audience: "tenant-a",
      subject: "user-1",
      issuedAt: now,
      expiresAt: now + 300,
      claims: {},
    });

    const result = await verifyJwt(token, toJwks([other]), {
      issuer: ISSUER,
      audience: "tenant-a",
      currentDate: new Date(now * 1000),
    });

    expect(result.ok).toBe(false);
  });
});
