import { randomToken } from "@sandbox/shared";
import { REFRESH_TOKEN_TTL_SECONDS } from "../../domain/policy.ts";
import type { RefreshToken } from "../ports/stores.ts";
import type { AuthDeps } from "../deps.ts";

type NewRefreshTokenInput = Omit<RefreshToken, "token" | "familyId" | "status">;

/**
 * 新しい系列で Refresh Token を発行する。code 交換時に使う。
 */
export async function createRefreshTokenFamily(
  deps: AuthDeps,
  input: NewRefreshTokenInput,
): Promise<RefreshToken> {
  const familyId = randomToken(16);
  const token = await storeRefreshToken(deps, { ...input, familyId });
  await Promise.all([
    deps.stores.refreshTokenFamilies.add(familyId, token.token, REFRESH_TOKEN_TTL_SECONDS),
    deps.stores.sidRefreshFamilies.add(input.sid, familyId, REFRESH_TOKEN_TTL_SECONDS),
  ]);
  return token;
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
  const stored = await deps.stores.refreshTokens.getAndDelete(value);
  if (stored === undefined) return { kind: "unknown" };
  if (stored.status !== "active") {
    // 再利用検知の記録は残す
    await deps.stores.refreshTokens.set(value, stored, REFRESH_TOKEN_TTL_SECONDS);
    return { kind: "reused", token: stored };
  }
  await deps.stores.refreshTokens.set(
    value,
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
): Promise<RefreshToken> {
  const next = await storeRefreshToken(deps, current);
  await deps.stores.refreshTokenFamilies.add(
    current.familyId,
    next.token,
    REFRESH_TOKEN_TTL_SECONDS,
  );
  return next;
}

/**
 * 系列全体を失効させる。再利用検知、Logout、Membership 削除時に使う。
 */
export async function revokeRefreshTokenFamily(deps: AuthDeps, familyId: string): Promise<void> {
  const tokens = await deps.stores.refreshTokenFamilies.members(familyId);
  await Promise.all(
    tokens.map(async (token) => {
      const stored = await deps.stores.refreshTokens.get(token);
      if (stored === undefined) return;
      await deps.stores.refreshTokens.set(
        token,
        { ...stored, status: "revoked" },
        REFRESH_TOKEN_TTL_SECONDS,
      );
    }),
  );
  deps.logger.warn("refresh token family revoked", { familyId });
}

async function storeRefreshToken(
  deps: AuthDeps,
  input: NewRefreshTokenInput & { familyId: string },
): Promise<RefreshToken> {
  const token: RefreshToken = {
    token: randomToken(),
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
  await deps.stores.refreshTokens.set(token.token, token, REFRESH_TOKEN_TTL_SECONDS);
  return token;
}
