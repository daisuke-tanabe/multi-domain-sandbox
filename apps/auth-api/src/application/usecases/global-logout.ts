import { getErrorMessage, randomToken, signJwt } from "@sandbox/shared";
import { BACKCHANNEL_TIMEOUT_MS, LOGOUT_TOKEN_TTL_SECONDS } from "../../domain/policy.ts";
import type { OidcClient } from "../../domain/identity.ts";
import type { RequestEnvironment, SessionRevokeReason } from "../../domain/session.ts";
import type { SsoSession } from "../ports/stores.ts";
import type { AuthDeps } from "../deps.ts";
import { recordAudit } from "./audit.ts";
import { unsealCognitoTokens } from "./cognito-tokens.ts";
import { listRefreshFamilies, revokeRefreshTokenFamily } from "./refresh-tokens.ts";
import { destroySsoSession, findSsoSessionBySid } from "./sso-session.ts";

interface BackchannelResult {
  readonly clientId: string;
  readonly ok: boolean;
}

/**
 * OIDC Back-Channel Logout 1.0 の logout_token。sid で対象セッションを指定し、nonce は含めない。
 */
export function issueLogoutToken(deps: AuthDeps, clientId: string, sid: string): Promise<string> {
  const now = deps.clock.nowSeconds();
  return signJwt(deps.signingKey, {
    issuer: deps.issuer,
    audience: clientId,
    subject: sid,
    issuedAt: now,
    expiresAt: now + LOGOUT_TOKEN_TTL_SECONDS,
    claims: {
      jti: randomToken(16),
      sid,
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
    },
  });
}

/**
 * sid のセッションを失効させる。docs/design/02-auth-sequences.md の 11 に対応する。
 * 揮発ストアに SSO Session が残っていれば Refresh Token 系列、Cognito の Refresh Token、SSO Session を消し、
 * 残っていなくても identity DB の記録から通知先を引いて Back-Channel Logout を送る。
 * 通知先は auth_session_clients。code を発行した client だけに送る
 */
export async function revokeSessionBySid(
  deps: AuthDeps,
  sid: string,
  reason: SessionRevokeReason,
  environment?: RequestEnvironment,
): Promise<void> {
  const [session, recorded] = await Promise.all([
    findSsoSessionBySid(deps, sid),
    deps.sessions.findWithClients(sid),
  ]);
  if (session !== undefined) {
    const families = await listRefreshFamilies(deps, sid);
    await Promise.all([
      ...families.map((ref) => revokeRefreshTokenFamily(deps, ref.familyId)),
      revokeCognitoTokens(deps, session),
      destroySsoSession(deps, session),
    ]);
    await deps.stores.sidRefreshFamilies.delete(sid);
  }

  const clientIds = [...new Set(recorded?.clients.map((c) => c.oidcClientId) ?? [])];
  const [notifications] = await Promise.all([
    Promise.all(clientIds.map((oidcClientId) => notifyClientById(deps, oidcClientId, sid))),
    deps.sessions.markRevoked(sid, reason, deps.clock.nowSeconds()),
  ]);
  await recordAudit(deps, {
    kind: reason === "global_logout" ? "global_logout" : "session_revoked",
    userId: session?.userId ?? recorded?.userId ?? null,
    sessionId: sid,
    ip: environment?.ip ?? null,
    userAgent: environment?.userAgent ?? null,
    detail: {
      reason,
      notified: notifications.filter((n) => n.ok).map((n) => n.clientId),
      failed: notifications.filter((n) => !n.ok).map((n) => n.clientId),
    },
  });
}

/** 本人の操作による Global Logout */
export function globalLogout(
  deps: AuthDeps,
  session: SsoSession,
  environment: RequestEnvironment,
): Promise<void> {
  return revokeSessionBySid(deps, session.sid, "global_logout", environment);
}

/**
 * 招待の解除で、そのサービスとテナントへのアクセスだけを即時に切る。
 * 該当する Refresh Token 系列を失効させ、そのサービスへ Back-Channel Logout を送る。
 * SSO Session は残し、他のサービスには影響させない
 */
export async function revokeClientAccess(
  deps: AuthDeps,
  userId: string,
  client: OidcClient,
  tenantId: string,
): Promise<ReadonlyArray<string>> {
  const sessions = await deps.sessions.listActiveByUser(userId);
  const affected = sessions.filter((s) =>
    s.clients.some((c) => c.oidcClientId === client.id && c.tenantId === tenantId),
  );
  await Promise.all(
    affected.map(async (record) => {
      const families = await listRefreshFamilies(deps, record.id);
      await Promise.all(
        families
          .filter((ref) => ref.clientId === client.clientId && ref.tenantId === tenantId)
          .map((ref) => revokeRefreshTokenFamily(deps, ref.familyId)),
      );
      await notifyClient(deps, client, record.id);
    }),
  );
  return affected.map((s) => s.id);
}

async function revokeCognitoTokens(deps: AuthDeps, session: SsoSession): Promise<void> {
  const tokens = unsealCognitoTokens(deps, session.encryptedCognitoTokens);
  if (tokens === undefined) return;
  const revoked = await deps.cognito.revokeRefreshToken(tokens.refreshToken);
  if (!revoked.ok) deps.logger.warn("cognito revoke failed", { reason: revoked.error.reason });
}

async function notifyClientById(
  deps: AuthDeps,
  oidcClientId: string,
  sid: string,
): Promise<BackchannelResult> {
  const client = await deps.identity.findClientById(oidcClientId);
  if (client === undefined) return { clientId: oidcClientId, ok: false };
  return notifyClient(deps, client, sid);
}

async function notifyClient(
  deps: AuthDeps,
  client: OidcClient,
  sid: string,
): Promise<BackchannelResult> {
  if (client.status !== "active" || client.backchannelLogoutUri === null) {
    return { clientId: client.clientId, ok: false };
  }
  try {
    const logoutToken = await issueLogoutToken(deps, client.clientId, sid);
    // 応答しない Client でユーザーのログアウトを待たせない
    const res = await deps.fetch(client.backchannelLogoutUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-store" },
      body: new URLSearchParams({ logout_token: logoutToken }).toString(),
      signal: AbortSignal.timeout(BACKCHANNEL_TIMEOUT_MS),
    });
    if (!res.ok)
      deps.logger.warn("backchannel logout rejected", {
        clientId: client.clientId,
        status: res.status,
      });
    return { clientId: client.clientId, ok: res.ok };
  } catch (error: unknown) {
    deps.logger.warn("backchannel logout failed", {
      clientId: client.clientId,
      reason: getErrorMessage(error),
    });
    return { clientId: client.clientId, ok: false };
  }
}
