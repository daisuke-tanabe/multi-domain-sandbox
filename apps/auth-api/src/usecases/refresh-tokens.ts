import { randomToken } from "@sandbox/shared";
import { REFRESH_TOKEN_TTL_SECONDS } from "../policy.ts";
import type { RefreshToken, RefreshTokenFamily } from "../ports/stores.ts";
import type { AuthDeps } from "./deps.ts";

type NewRefreshTokenInput = Omit<RefreshToken, "token" | "familyId" | "status" | "createdAt">;

/**
 * 新しい系列で Refresh Token を発行する。code 交換時に使う。
 */
export async function createRefreshTokenFamily(
  deps: AuthDeps,
  input: NewRefreshTokenInput,
): Promise<RefreshToken> {
  const familyId = randomToken(16);
  const token = await storeRefreshToken(deps, { ...input, familyId });
  await deps.stores.refreshTokenFamilies.set(
    familyId,
    { familyId, tokens: [token.token], revoked: false },
    REFRESH_TOKEN_TTL_SECONDS,
  );
  const families = (await deps.stores.sidRefreshFamilies.get(input.sid)) ?? [];
  await deps.stores.sidRefreshFamilies.set(
    input.sid,
    [...families, familyId],
    REFRESH_TOKEN_TTL_SECONDS,
  );
  return token;
}

/**
 * 使用済みの Refresh Token を rotated にし、同じ系列で新しい Token を発行する。
 */
export async function rotateRefreshToken(
  deps: AuthDeps,
  current: RefreshToken,
): Promise<RefreshToken> {
  const rotated: RefreshToken = { ...current, status: "rotated" };
  await deps.stores.refreshTokens.set(rotated.token, rotated, REFRESH_TOKEN_TTL_SECONDS);

  const next = await storeRefreshToken(deps, current);
  const family = await deps.stores.refreshTokenFamilies.get(current.familyId);
  const tokens =
    family === undefined ? [current.token, next.token] : [...family.tokens, next.token];
  await deps.stores.refreshTokenFamilies.set(
    current.familyId,
    { familyId: current.familyId, tokens, revoked: false },
    REFRESH_TOKEN_TTL_SECONDS,
  );
  return next;
}

/**
 * 系列全体を失効させる。再利用検知、Logout、Membership 削除時に使う。
 */
export async function revokeRefreshTokenFamily(deps: AuthDeps, familyId: string): Promise<void> {
  const family = await deps.stores.refreshTokenFamilies.get(familyId);
  if (family === undefined) return;
  const revokedFamily: RefreshTokenFamily = { ...family, revoked: true };
  await deps.stores.refreshTokenFamilies.set(familyId, revokedFamily, REFRESH_TOKEN_TTL_SECONDS);
  for (const token of family.tokens) {
    const stored = await deps.stores.refreshTokens.get(token);
    if (stored === undefined) continue;
    await deps.stores.refreshTokens.set(
      token,
      { ...stored, status: "revoked" },
      REFRESH_TOKEN_TTL_SECONDS,
    );
  }
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
    createdAt: deps.clock.nowSeconds(),
  };
  await deps.stores.refreshTokens.set(token.token, token, REFRESH_TOKEN_TTL_SECONDS);
  return token;
}
