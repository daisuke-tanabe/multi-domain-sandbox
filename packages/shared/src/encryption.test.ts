import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { decrypt, encrypt, parseEncryptionKey } from "./encryption.ts";

function makeKey(id: string) {
  const parsed = parseEncryptionKey(id, randomBytes(32).toString("base64"));
  if (!parsed.ok) throw new Error("key generation failed");
  return parsed.value;
}

describe("encryption", () => {
  test("round-trips plaintext and records key id in payload", () => {
    // Arrange
    const key = makeKey("k1");

    // Act
    const payload = encrypt("cognito-refresh-token", key);
    const result = decrypt(payload, [key]);

    // Assert
    expect(payload.split(".")[1]).toBe("k1");
    expect(result).toEqual({ ok: true, value: "cognito-refresh-token" });
  });

  test("decrypts with rotated key set when old key is still present", () => {
    // Arrange
    const oldKey = makeKey("k1");
    const newKey = makeKey("k2");
    const payload = encrypt("secret", oldKey);

    // Act
    const result = decrypt(payload, [newKey, oldKey]);

    // Assert
    expect(result).toEqual({ ok: true, value: "secret" });
  });

  test("returns unknown_key when key id is not available", () => {
    const payload = encrypt("secret", makeKey("k1"));
    expect(decrypt(payload, [makeKey("k2")])).toEqual({
      ok: false,
      error: { kind: "unknown_key", keyId: "k1" },
    });
  });

  test("returns auth_failed when ciphertext is tampered", () => {
    // Arrange
    const key = makeKey("k1");
    const parts = encrypt("secret", key).split(".");
    const tampered = [...parts.slice(0, 4), "AAAAAAAAAAAAAAAAAAAAAA"].join(".");

    // Act
    const result = decrypt(tampered, [key]);

    // Assert
    expect(result).toEqual({ ok: false, error: { kind: "auth_failed" } });
  });

  test("rejects key with wrong length", () => {
    expect(parseEncryptionKey("k", "c2hvcnQ=")).toEqual({
      ok: false,
      error: { kind: "invalid_key_length" },
    });
  });
});
