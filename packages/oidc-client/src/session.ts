import { randomToken } from "@sandbox/shared";
import type { TokenResponse } from "./provider.ts";
import {
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  type OidcClientDeps,
  type TenantSession,
} from "./types.ts";

function sessionKey(tenantSlug: string, id: string): string {
  return `${tenantSlug}:${id}`;
}

function remainingAbsoluteTtl(session: TenantSession, now: number): number {
  return session.createdAt + SESSION_ABSOLUTE_SECONDS - now;
}

/**
 * Cookie の値から Tenant Session を取得する。テナントをまたいだ参照はキー空間で防ぐ。
 */
export async function loadSession(
  deps: OidcClientDeps,
  tenantSlug: string,
  sessionId: string | undefined,
): Promise<TenantSession | undefined> {
  if (sessionId === undefined || sessionId === "") return undefined;
  const session = await deps.sessions.get(sessionKey(tenantSlug, sessionId));
  if (session === undefined || session.tenantSlug !== tenantSlug) return undefined;

  const now = deps.clock.nowSeconds();
  const idleExpired = session.lastSeenAt + SESSION_IDLE_SECONDS <= now;
  if (idleExpired || remainingAbsoluteTtl(session, now) <= 0) {
    await destroySession(deps, session);
    return undefined;
  }
  return session;
}

export interface NewSessionInput {
  readonly tenantSlug: string;
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
    tenantSlug: input.tenantSlug,
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
    sessionKey(session.tenantSlug, session.id),
    session,
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
    sessionKey(updated.tenantSlug, updated.id),
    updated,
    remainingAbsoluteTtl(updated, now),
  );
  return updated;
}

export function destroySession(deps: OidcClientDeps, session: TenantSession): Promise<void> {
  return deps.sessions.delete(sessionKey(session.tenantSlug, session.id));
}
