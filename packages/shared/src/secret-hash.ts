import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * client_secret のハッシュ。scrypt。
 * 形式: scrypt$<salt base64url>$<hash base64url>
 */
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const SCRYPT_COST = 16384;

export function hashSecret(secret: string, salt: Buffer = randomBytes(SALT_BYTES)): string {
  const hash = scryptSync(secret, salt, HASH_BYTES, { N: SCRYPT_COST });
  return ["scrypt", salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifySecret(secret: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltPart, hashPart] = parts;
  if (saltPart === undefined || hashPart === undefined) return false;
  const expected = Buffer.from(hashPart, "base64url");
  const actual = scryptSync(secret, Buffer.from(saltPart, "base64url"), expected.length, {
    N: SCRYPT_COST,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
