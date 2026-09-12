import { createSessionExpiry, randomToken } from "@sandbox/shared";
import { SSO_SESSION_ABSOLUTE_SECONDS, SSO_SESSION_IDLE_SECONDS } from "../../domain/policy.ts";
import type { OidcClient, User } from "../../domain/identity.ts";
import { environmentChanged, type RequestEnvironment } from "../../domain/session.ts";
import type { CognitoAuthenticated } from "../ports/cognito.ts";
import type { SsoSession } from "../ports/stores.ts";
import type { AuthDeps } from "../deps.ts";
import { recordAudit } from "./audit.ts";
import { sealCognitoTokens } from "./cognito-tokens.ts";
import { keyOf } from "./store-keys.ts";

const expiry = createSessionExpiry({
  idleSeconds: SSO_SESSION_IDLE_SECONDS,
  absoluteSeconds: SSO_SESSION_ABSOLUTE_SECONDS,
});

export interface CreatedSsoSession {
  readonly session: SsoSession;
  /** Cookie に入れる値。ストアにはこの値の SHA-256 だけを置く */
  readonly cookieValue: string;
}

/**
 * Cookie の値から SSO Session を取得する。アイドルと絶対の両方の期限を確認する。
 */
export function loadSsoSession(
  deps: AuthDeps,
  cookieValue: string | undefined,
): Promise<SsoSession | undefined> {
  if (cookieValue === undefined || cookieValue === "") return Promise.resolve(undefined);
  return loadSsoSessionByKey(deps, keyOf(cookieValue));
}

/** ストアのキーで取得する。code や Refresh Token が持つ ssoSessionId はこのキー */
export async function loadSsoSessionByKey(
  deps: AuthDeps,
  key: string,
): Promise<SsoSession | undefined> {
  const session = await deps.stores.ssoSessions.get(key);
  if (session === undefined) return undefined;
  if (expiry.isExpired(session, deps.clock.nowSeconds())) {
    await destroySsoSession(deps, session);
    return undefined;
  }
  return session;
}

/** sid から SSO Session を引く。ポータルからの失効や招待解除で使う */
export async function findSsoSessionBySid(
  deps: AuthDeps,
  sid: string,
): Promise<SsoSession | undefined> {
  const key = await deps.stores.sidIndex.get(sid);
  if (key === undefined) return undefined;
  return loadSsoSessionByKey(deps, key);
}

/**
 * 認証成功時に新しい SSO Session を作る。Cookie の値は毎回新規発行し、identity DB に記録を残す。
 */
export async function createSsoSession(
  deps: AuthDeps,
  user: User,
  authenticated: CognitoAuthenticated,
  environment: RequestEnvironment,
): Promise<CreatedSsoSession> {
  const now = deps.clock.nowSeconds();
  const cookieValue = randomToken();
  const session: SsoSession = {
    id: keyOf(cookieValue),
    sid: randomToken(),
    userId: user.id,
    encryptedCognitoTokens: sealCognitoTokens(deps, authenticated.tokens),
    authTime: now,
    createdAt: now,
    lastSeenAt: now,
  };
  await Promise.all([
    deps.stores.ssoSessions.set(session.id, session, SSO_SESSION_ABSOLUTE_SECONDS),
    deps.stores.sidIndex.set(session.sid, session.id, SSO_SESSION_ABSOLUTE_SECONDS),
    deps.sessions.create({
      id: session.sid,
      userId: user.id,
      ip: environment.ip,
      userAgent: environment.userAgent,
      createdAt: now,
      lastSeenAt: now,
    }),
  ]);
  return { session, cookieValue };
}

/**
 * /authorize 到達時に lastSeenAt を更新し、code を発行した client とテナントを記録する。
 * ブラウザの環境が前回と違えば監査イベントを残す。それだけでは失効させない。
 */
export async function touchSsoSession(
  deps: AuthDeps,
  session: SsoSession,
  client: OidcClient,
  tenantId: string,
  environment: RequestEnvironment,
): Promise<SsoSession> {
  const now = deps.clock.nowSeconds();
  const updated: SsoSession = { ...session, lastSeenAt: now };
  const [previous] = await Promise.all([
    deps.sessions.touch(session.sid, environment, now),
    deps.stores.ssoSessions.set(updated.id, updated, expiry.remainingTtl(updated, now)),
    deps.sessions.recordClient(session.sid, client.id, tenantId, now),
  ]);
  if (previous !== undefined && environmentChanged(previous, environment)) {
    await recordAudit(deps, {
      kind: "environment_changed",
      userId: session.userId,
      sessionId: session.sid,
      tenantId,
      clientId: client.clientId,
      ip: environment.ip,
      userAgent: environment.userAgent,
      detail: { previous, current: environment },
    });
  }
  return updated;
}

export async function destroySsoSession(deps: AuthDeps, session: SsoSession): Promise<void> {
  await Promise.all([
    deps.stores.ssoSessions.delete(session.id),
    deps.stores.sidIndex.delete(session.sid),
  ]);
}
