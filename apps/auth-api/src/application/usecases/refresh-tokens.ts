import { randomToken } from "@sandbox/shared";
import { REFRESH_TOKEN_TTL_SECONDS } from "../../domain/policy.ts";
import type { RefreshToken } from "../ports/stores.ts";
import type { AuthDeps } from "../deps.ts";
import { keyOf } from "./store-keys.ts";

type NewRefreshTokenInput = Omit<RefreshToken, "familyId" | "status">;

export interface IssuedRefreshToken {
  /** Client に返す値。ストアにはこの値の SHA-256 だけを置く */
  readonly value: string;
  readonly record: RefreshToken;
}

/**
 * 新しい系列で Refresh Token を発行する。code 交換時に使う。
 */
export async function createRefreshTokenFamily(
  deps: AuthDeps,
  input: NewRefreshTokenInput,
): Promise<IssuedRefreshToken> {
  const familyId = randomToken(16);
  const issued = await storeRefreshToken(deps, { ...input, familyId });
  await Promise.all([
    deps.stores.refreshTokenFamilies.add(familyId, keyOf(issued.value), REFRESH_TOKEN_TTL_SECONDS),
    deps.stores.sidRefreshFamilies.add(input.sid, familyId, REFRESH_TOKEN_TTL_SECONDS),
  ]);
  return issued;
}

export type ConsumeResult =
  | { readonly kind: "consumed"; readonly token: RefreshToken }
  | { readonly kind: "unknown" }
  | { readonly kind: "reused"; readonly token: RefreshToken };

/**
 * Refresh Token を一回限りで消費する。GETDEL で取り出した直後に rotated として書き戻すため、
 * 同じ値を同時に提示した 2 つ目は unknown か reused になり、両方が成功することはない。
 */
export async function consumeRefreshToken(deps: AuthDeps, value: string): Promise<ConsumeResult> {
  const key = keyOf(value);
  const stored = await deps.stores.refreshTokens.getAndDelete(key);
  if (stored === undefined) return { kind: "unknown" };
  if (stored.status !== "active") {
    // 再利用検知の記録は残す
    await deps.stores.refreshTokens.set(key, stored, REFRESH_TOKEN_TTL_SECONDS);
    return { kind: "reused", token: stored };
  }
  await deps.stores.refreshTokens.set(
    key,
    { ...stored, status: "rotated" },
    REFRESH_TOKEN_TTL_SECONDS,
  );
  return { kind: "consumed", token: stored };
}

/**
 * 消費済みの Refresh Token と同じ系列で新しい Token を発行する。
 */
export async function rotateRefreshToken(
  deps: AuthDeps,
  current: RefreshToken,
): Promise<IssuedRefreshToken> {
  const next = await storeRefreshToken(deps, current);
  await deps.stores.refreshTokenFamilies.add(
    current.familyId,
    keyOf(next.value),
    REFRESH_TOKEN_TTL_SECONDS,
  );
  return next;
}

/**
 * 系列全体を失効させる。再利用検知、Logout、Membership 削除時に使う。
 */
export async function revokeRefreshTokenFamily(deps: AuthDeps, familyId: string): Promise<void> {
  const keys = await deps.stores.refreshTokenFamilies.members(familyId);
  await Promise.all(
    keys.map(async (key) => {
      const stored = await deps.stores.refreshTokens.get(key);
      if (stored === undefined) return;
      await deps.stores.refreshTokens.set(
        key,
        { ...stored, status: "revoked" },
        REFRESH_TOKEN_TTL_SECONDS,
      );
    }),
  );
  deps.logger.warn("refresh token family revoked", { familyId });
}

/** 系列の先頭の記録。どの Client とテナントの系列かを知るために使う */
export async function describeRefreshTokenFamily(
  deps: AuthDeps,
  familyId: string,
): Promise<RefreshToken | undefined> {
  const keys = await deps.stores.refreshTokenFamilies.members(familyId);
  for (const key of keys) {
    const stored = await deps.stores.refreshTokens.get(key);
    if (stored !== undefined) return stored;
  }
  return undefined;
}

async function storeRefreshToken(
  deps: AuthDeps,
  input: NewRefreshTokenInput & { familyId: string },
): Promise<IssuedRefreshToken> {
  const value = randomToken();
  const record: RefreshToken = {
    familyId: input.familyId,
    clientId: input.clientId,
    userId: input.userId,
    tenantId: input.tenantId,
    sid: input.sid,
    ssoSessionId: input.ssoSessionId,
    scope: input.scope,
    authTime: input.authTime,
    status: "active",
  };
  await deps.stores.refreshTokens.set(keyOf(value), record, REFRESH_TOKEN_TTL_SECONDS);
  return { value, record };
}
