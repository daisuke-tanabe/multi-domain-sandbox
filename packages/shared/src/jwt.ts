import { createHash } from "node:crypto";
import {
  SignJWT,
  createLocalJWKSet,
  errors as joseErrors,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  importPKCS8,
  jwtVerify,
  type CryptoKey,
  type JWK,
  type JWTPayload,
  type JSONWebKeySet,
} from "jose";
import type { Clock } from "./clock.ts";
import { err, ok, type Result } from "./result.ts";

/**
 * Auth Server の署名鍵と、Client / API Server 側の検証をまとめる。
 * アルゴリズムは RS256 に固定し、alg 混同攻撃を防ぐ。
 */
export const SIGNING_ALGORITHM = "RS256";

export interface SigningKey {
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly publicJwk: JWK;
}

function computeKid(publicJwk: JWK): string {
  // RFC 7638 の JWK Thumbprint 相当。n と e から決定的に導出する
  const material = JSON.stringify({ e: publicJwk.e, kty: publicJwk.kty, n: publicJwk.n });
  return createHash("sha256").update(material).digest("base64url").slice(0, 16);
}

async function toSigningKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<SigningKey> {
  const publicJwk = await exportJWK(publicKey);
  const kid = computeKid(publicJwk);
  return { kid, privateKey, publicJwk: { ...publicJwk, kid, alg: SIGNING_ALGORITHM, use: "sig" } };
}

/** 開発用。起動ごとに鍵を生成する */
export async function generateSigningKey(): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair(SIGNING_ALGORITHM, {
    modulusLength: 2048,
  });
  return toSigningKey(privateKey, publicKey);
}

/** PKCS#8 PEM から鍵を読み込む。公開鍵は秘密鍵から導出する */
export async function importSigningKeyFromPem(pem: string): Promise<SigningKey> {
  const privateKey = await importPKCS8(pem, SIGNING_ALGORITHM, { extractable: true });
  const jwk = await exportJWK(privateKey);
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...publicJwk } = jwk;
  const kid = computeKid(publicJwk);
  return { kid, privateKey, publicJwk: { ...publicJwk, kid, alg: SIGNING_ALGORITHM, use: "sig" } };
}

export function toJwks(keys: ReadonlyArray<SigningKey>): JSONWebKeySet {
  return { keys: keys.map((key) => key.publicJwk) };
}

export interface SignOptions {
  readonly issuer: string;
  readonly audience: string | string[];
  readonly subject: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly claims: Readonly<Record<string, unknown>>;
}

export function signJwt(key: SigningKey, options: SignOptions): Promise<string> {
  return new SignJWT({ ...options.claims })
    .setProtectedHeader({ alg: SIGNING_ALGORITHM, kid: key.kid, typ: "JWT" })
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setSubject(options.subject)
    .setIssuedAt(options.issuedAt)
    .setExpirationTime(options.expiresAt)
    .sign(key.privateKey);
}

/** 期限切れだけは呼び出し側が Refresh の判断に使うため区別する */
export type VerifyError =
  | { readonly kind: "expired" }
  | { readonly kind: "invalid_token"; readonly reason: string };

export interface VerifyOptions {
  readonly issuer: string;
  /** 省略時は aud を検証しない。呼び出し側で aud を別途検証すること */
  readonly audience?: string;
  /** 省略時はシステム時刻 */
  readonly clock?: Clock;
  readonly clockToleranceSeconds?: number;
}

const DEFAULT_CLOCK_TOLERANCE_SECONDS = 30;

// createLocalJWKSet は呼ぶたびに公開鍵を import し直すため、JWKS オブジェクトごとに使い回す
const localKeySets = new WeakMap<JSONWebKeySet, ReturnType<typeof createLocalJWKSet>>();

function localKeySet(jwks: JSONWebKeySet): ReturnType<typeof createLocalJWKSet> {
  let keySet = localKeySets.get(jwks);
  if (keySet === undefined) {
    keySet = createLocalJWKSet(jwks);
    localKeySets.set(jwks, keySet);
  }
  return keySet;
}

/**
 * JWKS で JWT を検証する。alg は RS256 のみ許可する。
 */
export async function verifyJwt(
  token: string,
  jwks: JSONWebKeySet,
  options: VerifyOptions,
): Promise<Result<JWTPayload, VerifyError>> {
  try {
    const { payload } = await jwtVerify(token, localKeySet(jwks), {
      algorithms: [SIGNING_ALGORITHM],
      issuer: options.issuer,
      ...(options.audience !== undefined && { audience: options.audience }),
      clockTolerance: options.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS,
      ...(options.clock !== undefined && {
        currentDate: new Date(options.clock.nowSeconds() * 1000),
      }),
    });
    return ok(payload);
  } catch (error: unknown) {
    if (error instanceof joseErrors.JWTExpired) return err({ kind: "expired" });
    return err({
      kind: "invalid_token",
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

export type { JWTPayload, JSONWebKeySet };

/**
 * 署名検証せずにヘッダの kid だけ読む。鍵ローテーション時の JWKS 再取得判断に使う。
 */
export function readJwtKid(token: string): string | undefined {
  try {
    const header = decodeProtectedHeader(token);
    return typeof header.kid === "string" ? header.kid : undefined;
  } catch {
    return undefined;
  }
}
