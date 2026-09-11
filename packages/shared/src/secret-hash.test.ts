import { describe, expect, test } from "vitest";
import { hashSecret, verifySecret, verifySecretAgainstAny } from "./secret-hash.ts";

describe("secret hash", () => {
  test("verifies the original secret", () => {
    const stored = hashSecret("crm-secret");
    expect(stored.startsWith("sha256$")).toBe(true);
    expect(verifySecret("crm-secret", stored)).toBe(true);
  });

  test("rejects a different secret", () => {
    expect(verifySecret("cms-secret", hashSecret("crm-secret"))).toBe(false);
  });

  test("rejects malformed stored values", () => {
    expect(verifySecret("x", "plain")).toBe(false);
    expect(verifySecret("x", "scrypt$a$b")).toBe(false);
  });

  test("accepts any active hash during rotation", () => {
    const hashes = [hashSecret("old"), hashSecret("new")];
    expect(verifySecretAgainstAny("old", hashes)).toBe(true);
    expect(verifySecretAgainstAny("new", hashes)).toBe(true);
    expect(verifySecretAgainstAny("other", hashes)).toBe(false);
    expect(verifySecretAgainstAny("old", [])).toBe(false);
  });
});
