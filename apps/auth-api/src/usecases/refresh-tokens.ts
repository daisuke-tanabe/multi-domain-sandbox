import { randomToken } from "@sandbox/shared";
import { REFRESH_TOKEN_TTL_SECONDS } from "../policy.ts";
import type { RefreshToken } from "../ports/stores.ts";
import type { AuthDeps } from "./deps.ts";

type NewRefreshTokenInput = Omit<RefreshToken, "token" | "familyId" | "status">;

/**
 * 新しい系列で Refresh Token を発行する。code 交換時に使う。
 */
export async function createRefreshTokenFamily(
  deps: AuthDeps,
  input: NewRefreshTokenInput,
): Promise<RefreshToken> {
  const familyId = randomToken(16);
  const [token, families] = await Promise.all([
    storeRefreshToken(deps, { ...input, familyId }),
    deps.stores.sidRefreshFamilies.get(input.sid),
  ]);
  await Promise.all([
    deps.stores.refreshTokenFamilies.set(familyId, [token.token], REFRESH_TOKEN_TTL_SECONDS),
    deps.stores.sidRefreshFamilies.set(
      input.sid,
      [...(families ?? []), familyId],
      REFRESH_TOKEN_TTL_SECONDS,
    ),
  ]);
  return token;
}

/**
 * 使用済みの Refresh Token を rotated にし、同じ系列で新しい Token を発行する。
 */
export async function rotateRefreshToken(
  deps: AuthDeps,
  current: RefreshToken,
): Promise<RefreshToken> {
  const [, next, family] = await Promise.all([
    deps.stores.refreshTokens.set(
      current.token,
      { ...current, status: "rotated" },
      REFRESH_TOKEN_TTL_SECONDS,
    ),
    storeRefreshToken(deps, current),
    deps.stores.refreshTokenFamilies.get(current.familyId),
  ]);
  await deps.stores.refreshTokenFamilies.set(
    current.familyId,
    [...(family ?? [current.token]), next.token],
    REFRESH_TOKEN_TTL_SECONDS,
  );
  return next;
}

/**
 * 系列全体を失効させる。再利用検知、Logout、Membership 削除時に使う。
 */
export async function revokeRefreshTokenFamily(deps: AuthDeps, familyId: string): Promise<void> {
  const tokens = await deps.stores.refreshTokenFamilies.get(familyId);
  if (tokens === undefined) return;
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
