import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 の TOTP。認証アプリと Cognito の SOFTWARE_TOKEN_MFA と同じ既定値。
 *   HMAC-SHA1、6 桁、30 秒
 * Cognito のモックとテストと確認スクリプトで使う。本番の検証は Cognito が行う
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("invalid base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** 認証アプリに登録する secret。20 バイトの乱数を base32 にする */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function generateTotp(secret: string, nowSeconds: number): string {
  const counter = Math.floor(nowSeconds / TOTP_STEP_SECONDS);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", Buffer.from(base32Decode(secret)))
    .update(message)
    .digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  const binary =
    (((digest[offset] ?? 0) & 127) << 24) |
    (((digest[offset + 1] ?? 0) & 255) << 16) |
    (((digest[offset + 2] ?? 0) & 255) << 8) |
    ((digest[offset + 3] ?? 0) & 255);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** 前後 1 ステップの時刻ずれを許す */
export function verifyTotp(secret: string, code: string, nowSeconds: number, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotp(secret, nowSeconds + offset * TOTP_STEP_SECONDS);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }
  return false;
}

/** 認証アプリが読む otpauth URI。QR コードにする */
export function otpauthUri(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
