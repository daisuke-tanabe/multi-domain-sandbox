import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

/** 256bit の CSPRNG 由来トークン。base64url */
export function randomToken(bytes: number = TOKEN_BYTES): string {
  return randomBytes(bytes).toString("base64url");
}

/** PKCE code_verifier。RFC 7636 の 43〜128 文字の範囲に収まる */
export function generateCodeVerifier(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** PKCE S256。BASE64URL(SHA256(code_verifier)) */
export function computeCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

const CODE_VERIFIER_MIN = 43;
const CODE_VERIFIER_MAX = 128;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]+$/;

export function isValidCodeVerifier(value: string): boolean {
  return (
    value.length >= CODE_VERIFIER_MIN &&
    value.length <= CODE_VERIFIER_MAX &&
    CODE_VERIFIER_PATTERN.test(value)
  );
}

/** 長さの違いを含めて一定時間で比較する。CSRF トークンやパスワードの照合に使う */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
