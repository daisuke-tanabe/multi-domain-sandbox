import { createSessionExpiry, randomToken } from "@sandbox/shared";
import type { TokenResponse } from "./provider.ts";
import {
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  type OidcClientConfig,
  type OidcClientDeps,
  type TenantSession,
} from "./types.ts";

const expiry = createSessionExpiry({
  idleSeconds: SESSION_IDLE_SECONDS,
  absoluteSeconds: SESSION_ABSOLUTE_SECONDS,
});

/** 1 プロセス 1 サービスなので、キーはテナントとセッション ID で分ける */
function sessionKey(tenantSlug: string, id: string): string {
  return `${tenantSlug}:${id}`;
}

function sidKey(sid: string): string {
  return `sid:${sid}`;
}

/**
 * Cookie の値から Tenant Session を取得する。テナントをまたいだ参照はキー空間で防ぐ。
 */
export async function loadSession(
  deps: OidcClientDeps,
  client: OidcClientConfig,
  sessionId: string | undefined,
): Promise<TenantSession | undefined> {
  if (sessionId === undefined || sessionId === "") return undefined;
  const session = await deps.sessions.get(sessionKey(client.tenantSlug, sessionId));
  if (session === undefined) return undefined;
  if (expiry.isExpired(session, deps.clock.nowSeconds())) {
    await destroySession(deps, session);
    return undefined;
  }
  return session;
}

export interface NewSessionInput {
  readonly client: OidcClientConfig;
  readonly userId: string;
  readonly tenantId: string;
  readonly sid: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly tokens: TokenResponse;
}

/**
 * code 交換成功後に新しい ID でセッションを作る。既存セッションがあれば呼び出し側で破棄する。
 */
export async function createSession(
  deps: OidcClientDeps,
  input: NewSessionInput,
): Promise<TenantSession> {
  const now = deps.clock.nowSeconds();
  const session: TenantSession = {
    id: randomToken(),
    tenantSlug: input.client.tenantSlug,
    userId: input.userId,
    tenantId: input.tenantId,
    sid: input.sid,
    email: input.email,
    name: input.name,
    accessToken: input.tokens.access_token,
    accessTokenExpiresAt: now + input.tokens.expires_in,
    refreshToken: input.tokens.refresh_token,
    csrfToken: randomToken(),
    createdAt: now,
    lastSeenAt: now,
  };
  const key = sessionKey(session.tenantSlug, session.id);
  await Promise.all([
    deps.sessions.set(key, session, SESSION_ABSOLUTE_SECONDS),
    deps.sessionsBySid.add(sidKey(session.sid), key, SESSION_ABSOLUTE_SECONDS),
  ]);
  return session;
}

/** Token などの内容が変わったときに保存する。lastSeenAt も進める */
export async function saveSession(
  deps: OidcClientDeps,
  session: TenantSession,
): Promise<TenantSession> {
  const now = deps.clock.nowSeconds();
  const updated: TenantSession = { ...session, lastSeenAt: now };
  await deps.sessions.set(
    sessionKey(updated.tenantSlug, updated.id),
    updated,
    expiry.remainingTtl(updated, now),
  );
  return updated;
}

/**
 * リクエストごとの lastSeenAt 更新。前回から間隔が空いていなければ書き込まない。
 * 書く直前に読み直し、並行する Refresh が更新した Token を古い値で上書きしない。
 */
export async function touchSession(
  deps: OidcClientDeps,
  session: TenantSession,
): Promise<TenantSession> {
  if (!expiry.shouldTouch(session, deps.clock.nowSeconds())) return session;
  const latest = await deps.sessions.get(sessionKey(session.tenantSlug, session.id));
  return saveSession(deps, latest ?? session);
}

export async function destroySession(deps: OidcClientDeps, session: TenantSession): Promise<void> {
  const key = sessionKey(session.tenantSlug, session.id);
  await Promise.all([
    deps.sessions.delete(key),
    deps.sessionsBySid.remove(sidKey(session.sid), key),
  ]);
}

/**
 * Back-Channel Logout。同じ sid で作られたこのサービスのセッションを、テナントを問わずすべて削除する。
 */
export async function destroySessionsBySid(deps: OidcClientDeps, sid: string): Promise<number> {
  const keys = await deps.sessionsBySid.members(sidKey(sid));
  await Promise.all([
    ...keys.map((key) => deps.sessions.delete(key)),
    deps.sessionsBySid.delete(sidKey(sid)),
  ]);
  return keys.length;
}
