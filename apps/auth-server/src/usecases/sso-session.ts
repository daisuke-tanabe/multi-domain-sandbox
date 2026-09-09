import { encrypt, randomToken } from "@sandbox/shared";
import { SSO_SESSION_ABSOLUTE_SECONDS, SSO_SESSION_IDLE_SECONDS } from "../policy.ts";
import type { CognitoAuthenticated } from "../ports/cognito.ts";
import type { User } from "../ports/identity-repository.ts";
import type { SsoSession } from "../ports/stores.ts";
import type { AuthDeps } from "./deps.ts";

function remainingAbsoluteTtl(session: SsoSession, now: number): number {
  return session.createdAt + SSO_SESSION_ABSOLUTE_SECONDS - now;
}

/**
 * Cookie の値から SSO Session を取得する。アイドルと絶対の両方の期限を確認する。
 */
export async function loadSsoSession(
  deps: AuthDeps,
  sessionId: string | undefined,
): Promise<SsoSession | undefined> {
  if (sessionId === undefined || sessionId === "") return undefined;
  const session = await deps.stores.ssoSessions.get(sessionId);
  if (session === undefined) return undefined;

  const now = deps.clock.nowSeconds();
  const idleExpired = session.lastSeenAt + SSO_SESSION_IDLE_SECONDS <= now;
  const absoluteExpired = remainingAbsoluteTtl(session, now) <= 0;
  if (idleExpired || absoluteExpired) {
    await destroySsoSession(deps, session);
    return undefined;
  }
  return session;
}

/**
 * 認証成功時に新しい SSO Session を作る。セッション ID は毎回新規発行する。
 */
export async function createSsoSession(
  deps: AuthDeps,
  user: User,
  authenticated: CognitoAuthenticated,
): Promise<SsoSession> {
  const now = deps.clock.nowSeconds();
  const currentKey = deps.encryptionKeys[0];
  if (currentKey === undefined) throw new Error("No encryption key configured");

  const session: SsoSession = {
    id: randomToken(),
    sid: randomToken(),
    userId: user.id,
    cognitoSub: user.cognitoSub,
    encryptedCognitoTokens: encrypt(JSON.stringify(authenticated.tokens), currentKey),
    authTime: now,
    createdAt: now,
    lastSeenAt: now,
    authorizedClients: [],
  };
  await deps.stores.ssoSessions.set(session.id, session, SSO_SESSION_ABSOLUTE_SECONDS);
  await deps.stores.sidIndex.set(session.sid, session.id, SSO_SESSION_ABSOLUTE_SECONDS);
  return session;
}

/**
 * /authorize 到達時に lastSeenAt を更新し、code を発行した client を記録する。
 */
export async function touchSsoSession(
  deps: AuthDeps,
  session: SsoSession,
  clientId: string,
): Promise<SsoSession> {
  const now = deps.clock.nowSeconds();
  const authorizedClients = session.authorizedClients.includes(clientId)
    ? session.authorizedClients
    : [...session.authorizedClients, clientId];
  const updated: SsoSession = { ...session, lastSeenAt: now, authorizedClients };
  await deps.stores.ssoSessions.set(updated.id, updated, remainingAbsoluteTtl(updated, now));
  return updated;
}

export async function destroySsoSession(deps: AuthDeps, session: SsoSession): Promise<void> {
  await Promise.all([
    deps.stores.ssoSessions.delete(session.id),
    deps.stores.sidIndex.delete(session.sid),
  ]);
}
