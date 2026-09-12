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

/** sid に紐付く系列の一覧の要素。どのサービスとテナントの系列かを一覧だけで分かるようにする */
export interface RefreshFamilyRef {
  readonly familyId: string;
  readonly clientId: string;
  readonly tenantId: string;
}

// client_id と tenant_id はどちらも ":" を含まない
const REF_SEPARATOR = ":";

function encodeFamilyRef(ref: RefreshFamilyRef): string {
  return [ref.clientId, ref.tenantId, ref.familyId].join(REF_SEPARATOR);
}

function decodeFamilyRef(member: string): RefreshFamilyRef | undefined {
  const [clientId, tenantId, familyId] = member.split(REF_SEPARATOR);
  if (clientId === undefined || tenantId === undefined || familyId === undefined) return undefined;
  return { clientId, tenantId, familyId };
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
    deps.stores.sidRefreshFamilies.add(
      input.sid,
      encodeFamilyRef({ familyId, clientId: input.clientId, tenantId: input.tenantId }),
      REFRESH_TOKEN_TTL_SECONDS,
    ),
  ]);
  return issued;
}

/** sid に紐付く系列。失効の対象を絞るのに使う */
export async function listRefreshFamilies(
  deps: AuthDeps,
  sid: string,
): Promise<ReadonlyArray<RefreshFamilyRef>> {
  const members = await deps.stores.sidRefreshFamilies.members(sid);
  return members.flatMap((member) => {
    const ref = decodeFamilyRef(member);
    return ref === undefined ? [] : [ref];
  });
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
  const records = await Promise.all(keys.map((key) => deps.stores.refreshTokens.get(key)));
  await Promise.all(
    records.map((stored, index) => {
      const key = keys[index];
      if (stored === undefined || key === undefined) return undefined;
      return deps.stores.refreshTokens.set(
        key,
        { ...stored, status: "revoked" },
        REFRESH_TOKEN_TTL_SECONDS,
      );
    }),
  );
  deps.logger.warn("refresh token family revoked", { familyId });
}

/** 系列の先頭の記録。code の再利用検知でどの人の系列かを知るために使う */
export async function describeRefreshTokenFamily(
  deps: AuthDeps,
  familyId: string,
): Promise<RefreshToken | undefined> {
  const keys = await deps.stores.refreshTokenFamilies.members(familyId);
  const records = await Promise.all(keys.map((key) => deps.stores.refreshTokens.get(key)));
  return records.find((record) => record !== undefined);
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
