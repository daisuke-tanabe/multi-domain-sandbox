import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { err, ok, type Result } from "./result.ts";

/**
 * Cognito Token を保存する際のアプリケーション層暗号化。AES-256-GCM。
 * 形式: v1.<keyId>.<iv>.<ciphertext>.<tag>  各要素は base64url
 */
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const FORMAT_VERSION = "v1";

export interface EncryptionKey {
  readonly id: string;
  readonly key: Buffer;
}

export type DecryptError =
  | { kind: "malformed" }
  | { kind: "unknown_key"; keyId: string }
  | { kind: "auth_failed" };

export function parseEncryptionKey(
  id: string,
  base64Key: string,
): Result<EncryptionKey, { kind: "invalid_key_length" }> {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_BYTES) return err({ kind: "invalid_key_length" });
  return ok({ id, key });
}

export function encrypt(plaintext: string, key: EncryptionKey): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key.key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    key.id,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decrypt(
  payload: string,
  keys: ReadonlyArray<EncryptionKey>,
): Result<string, DecryptError> {
  const parts = payload.split(".");
  if (parts.length !== 5 || parts[0] !== FORMAT_VERSION) return err({ kind: "malformed" });
  const [, keyId, ivPart, ciphertextPart, tagPart] = parts;
  if (
    keyId === undefined ||
    ivPart === undefined ||
    ciphertextPart === undefined ||
    tagPart === undefined
  ) {
    return err({ kind: "malformed" });
  }
  const key = keys.find((candidate) => candidate.id === keyId);
  if (key === undefined) return err({ kind: "unknown_key", keyId });
  try {
    const decipher = createDecipheriv(ALGORITHM, key.key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]);
    return ok(plaintext.toString("utf8"));
  } catch {
    return err({ kind: "auth_failed" });
  }
}
