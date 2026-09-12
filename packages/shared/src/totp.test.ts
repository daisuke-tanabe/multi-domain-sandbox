import { describe, expect, test } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotp,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from "./totp.ts";

describe("totp", () => {
  test("matches the RFC 6238 SHA-1 test vectors", () => {
    // RFC 6238 Appendix B。secret は "12345678901234567890" の ASCII
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(generateTotp(secret, 59)).toBe("287082");
    expect(generateTotp(secret, 1111111109)).toBe("081804");
    expect(generateTotp(secret, 1234567890)).toBe("005924");
  });

  test("base32 round trips", () => {
    const bytes = Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    // RFC 4648 のテストベクタ
    expect(Buffer.from(base32Decode("MZXW6YTBOI======")).toString()).toBe("foobar");
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });

  test("verifies codes within one step of drift and rejects others", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000;
    const code = generateTotp(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30)).toBe(true);
    expect(verifyTotp(secret, code, now + 61)).toBe(false);
    expect(verifyTotp(secret, "000000", now)).toBe(code === "000000");
    expect(verifyTotp(secret, "12345", now)).toBe(false);
  });

  test("builds an otpauth uri the authenticator apps accept", () => {
    const uri = otpauthUri("Sandbox", "alice@example.com", "JBSWY3DPEHPK3PXP");
    expect(uri).toBe(
      "otpauth://totp/Sandbox%3Aalice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Sandbox&algorithm=SHA1&digits=6&period=30",
    );
  });
});
