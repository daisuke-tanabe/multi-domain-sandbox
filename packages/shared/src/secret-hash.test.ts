import { describe, expect, test } from "vitest";
import { hashSecret, verifySecret } from "./secret-hash.ts";

describe("secret-hash", () => {
  test("verifies the original secret against its hash", () => {
    const stored = hashSecret("tenant-a-secret");
    expect(verifySecret("tenant-a-secret", stored)).toBe(true);
  });

  test("rejects a different secret", () => {
    const stored = hashSecret("tenant-a-secret");
    expect(verifySecret("tenant-b-secret", stored)).toBe(false);
  });

  test("rejects malformed stored value", () => {
    expect(verifySecret("x", "plain")).toBe(false);
  });
});
