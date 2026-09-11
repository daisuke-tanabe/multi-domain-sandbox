import { randomToken } from "@sandbox/shared";
import type { TokenResponse } from "./provider.ts";
import {
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  type OidcClientConfig,
  type OidcClientDeps,
  type TenantSession,
} from "./types.ts";

function sessionKey(clientId: string, tenantSlug: string, id: string): string {
  return `${clientId}:${tenantSlug}:${id}`;
}

function sidKey(clientId: string, sid: string): string {
  return `${clientId}:sid:${sid}`;
}

function remainingAbsoluteTtl(session: TenantSession, now: number): number {
  return session.createdAt + SESSION_ABSOLUTE_SECONDS - now;
}

/**
 * Cookie の値から Tenant Session を取得する。サービスやテナントをまたいだ参照はキー空間で防ぐ。
 */
export async function loadSession(
  deps: OidcClientDeps,
  client: OidcClientConfig,
  sessionId: string | undefined,
): Promise<TenantSession | undefined> {
  if (sessionId === undefined || sessionId === "") return undefined;
  const session = await deps.sessions.get(
    sessionKey(client.clientId, client.tenantSlug, sessionId),
  );
  if (
    session === undefined ||
    session.clientId !== client.clientId ||
    session.tenantSlug !== client.tenantSlug
  ) {
    return undefined;
  }

  const now = deps.clock.nowSeconds();
  const idleExpired = session.lastSeenAt + SESSION_IDLE_SECONDS <= now;
  if (idleExpired || remainingAbsoluteTtl(session, now) <= 0) {
    await destroySession(deps, session);
    return undefined;
  }
  return session;
}

export interface NewSessionInput {
  readonly client: OidcClientConfig;
  readonly userId: string;
  readonly tenantId: string | null;
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
    clientId: input.client.clientId,
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
  await deps.sessions.set(
    sessionKey(session.clientId, session.tenantSlug, session.id),
    session,
    SESSION_ABSOLUTE_SECONDS,
  );
  const existing = (await deps.sessionsBySid.get(sidKey(session.clientId, session.sid))) ?? [];
  await deps.sessionsBySid.set(
    sidKey(session.clientId, session.sid),
    [...existing, sessionKey(session.clientId, session.tenantSlug, session.id)],
    SESSION_ABSOLUTE_SECONDS,
  );
  return session;
}

export async function saveSession(
  deps: OidcClientDeps,
  session: TenantSession,
): Promise<TenantSession> {
  const now = deps.clock.nowSeconds();
  const updated: TenantSession = { ...session, lastSeenAt: now };
  await deps.sessions.set(
    sessionKey(updated.clientId, updated.tenantSlug, updated.id),
    updated,
    remainingAbsoluteTtl(updated, now),
  );
  return updated;
}

export function destroySession(deps: OidcClientDeps, session: TenantSession): Promise<void> {
  return deps.sessions.delete(sessionKey(session.clientId, session.tenantSlug, session.id));
}

/**
 * Back-Channel Logout。同じ sid で作られたこのサービスのセッションを、テナントを問わずすべて削除する。
 */
export async function destroySessionsBySid(
  deps: OidcClientDeps,
  clientId: string,
  sid: string,
): Promise<number> {
  const keys = (await deps.sessionsBySid.get(sidKey(clientId, sid))) ?? [];
  for (const key of keys) {
    await deps.sessions.delete(key);
  }
  await deps.sessionsBySid.delete(sidKey(clientId, sid));
  return keys.length;
}
