import { createSessionExpiry, encrypt, randomToken } from "@sandbox/shared";
import { SSO_SESSION_ABSOLUTE_SECONDS, SSO_SESSION_IDLE_SECONDS } from "../policy.ts";
import type { CognitoAuthenticated } from "../ports/cognito.ts";
import type { User } from "../ports/identity-repository.ts";
import type { SsoSession } from "../ports/stores.ts";
import type { AuthDeps } from "./deps.ts";

const expiry = createSessionExpiry({
  idleSeconds: SSO_SESSION_IDLE_SECONDS,
  absoluteSeconds: SSO_SESSION_ABSOLUTE_SECONDS,
});

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
  if (expiry.isExpired(session, deps.clock.nowSeconds())) {
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
    encryptedCognitoTokens: encrypt(JSON.stringify(authenticated.tokens), currentKey),
    authTime: now,
    createdAt: now,
    lastSeenAt: now,
  };
  await Promise.all([
    deps.stores.ssoSessions.set(session.id, session, SSO_SESSION_ABSOLUTE_SECONDS),
    deps.stores.sidIndex.set(session.sid, session.id, SSO_SESSION_ABSOLUTE_SECONDS),
  ]);
  return session;
}

/**
 * /authorize 到達時に lastSeenAt を更新し、code を発行した client を記録する。
 * client の記録は集合に足すだけなので、並行する /authorize で取りこぼさない。
 */
export async function touchSsoSession(
  deps: AuthDeps,
  session: SsoSession,
  clientId: string,
): Promise<SsoSession> {
  const now = deps.clock.nowSeconds();
  const updated: SsoSession = { ...session, lastSeenAt: now };
  const ttl = expiry.remainingTtl(updated, now);
  await Promise.all([
    deps.stores.ssoSessions.set(updated.id, updated, ttl),
    deps.stores.sessionClients.add(updated.id, clientId, ttl),
  ]);
  return updated;
}

/** この SSO Session で code を発行した client_id の一覧 */
export function listAuthorizedClients(
  deps: AuthDeps,
  session: SsoSession,
): Promise<ReadonlyArray<string>> {
  return deps.stores.sessionClients.members(session.id);
}

export async function destroySsoSession(deps: AuthDeps, session: SsoSession): Promise<void> {
  await Promise.all([
    deps.stores.ssoSessions.delete(session.id),
    deps.stores.sidIndex.delete(session.sid),
    deps.stores.sessionClients.delete(session.id),
  ]);
}
