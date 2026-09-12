import { createHash, timingSafeEqual } from "node:crypto";

/**
 * client_secret のハッシュ。
 * client_secret は人が選ぶパスワードではなく十分に長い乱数である前提で、KDF ではなく SHA-256 を使う。
 * scrypt はリクエストごとに数十ミリ秒イベントループを止めるため /token には向かない。
 * 形式: sha256$<hash base64url>
 */
const ALGORITHM = "sha256";

export function hashSecret(secret: string): string {
  return `${ALGORITHM}$${createHash(ALGORITHM).update(secret).digest("base64url")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [algorithm, hashPart, ...rest] = stored.split("$");
  if (algorithm !== ALGORITHM || hashPart === undefined || rest.length > 0) return false;
  const expected = Buffer.from(hashPart, "base64url");
  const actual = createHash(ALGORITHM).update(secret).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 登録済みハッシュのいずれかに一致するか。ローテーション中は複数の secret が有効になる */
export function verifySecretAgainstAny(secret: string, stored: ReadonlyArray<string>): boolean {
  return stored.some((hash) => verifySecret(secret, hash));
}

/**
 * 揮発ストアのキーに使うダイジェスト。Cookie の値や Refresh Token をそのままキーにしない。
 * 値は十分に長い乱数である前提で SHA-256 をそのまま使う
 */
export function keyDigest(secret: string): string {
  return createHash(ALGORITHM).update(secret).digest("base64url");
}
