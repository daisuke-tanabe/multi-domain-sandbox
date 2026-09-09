import { describe, expect, test } from "vitest";
import {
  computeCodeChallenge,
  generateCodeVerifier,
  isValidCodeVerifier,
  randomToken,
} from "./random.ts";

describe("PKCE", () => {
  test("computes S256 challenge matching RFC 7636 appendix B vector", () => {
    // Arrange
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    // Act
    const challenge = computeCodeChallenge(verifier);

    // Assert
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("generated verifier satisfies length and character constraints", () => {
    // Arrange & Act
    const verifier = generateCodeVerifier();

    // Assert
    expect(isValidCodeVerifier(verifier)).toBe(true);
  });

  test("rejects verifier shorter than 43 characters", () => {
    expect(isValidCodeVerifier("short")).toBe(false);
  });

  test("rejects verifier with characters outside unreserved set", () => {
    expect(isValidCodeVerifier("a".repeat(42) + "+")).toBe(false);
  });
});

describe("randomToken", () => {
  test("produces distinct base64url tokens", () => {
    const first = randomToken();
    const second = randomToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
