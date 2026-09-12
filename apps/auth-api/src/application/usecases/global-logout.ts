import { decrypt, getErrorMessage, randomToken, signJwt } from "@sandbox/shared";
import { BACKCHANNEL_TIMEOUT_MS, LOGOUT_TOKEN_TTL_SECONDS } from "../../domain/policy.ts";
import type { OidcClient } from "../../domain/identity.ts";
import type { RequestEnvironment, SessionRevokeReason } from "../../domain/session.ts";
import type { SsoSession } from "../ports/stores.ts";
import type { AuthDeps } from "../deps.ts";
import { recordAudit } from "./audit.ts";
import { describeRefreshTokenFamily, revokeRefreshTokenFamily } from "./refresh-tokens.ts";
import { destroySsoSession, findSsoSessionBySid, listAuthorizedClients } from "./sso-session.ts";

interface BackchannelResult {
  readonly clientId: string;
  readonly ok: boolean;
  readonly reason?: string;
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
 * SSO Session を失効させる。docs/design/02-auth-sequences.md の 11 に対応する。
 * 1. sid に紐付く Refresh Token 系列を全失効
 * 2. Cognito Refresh Token を失効
 * 3. SSO Session を削除
 * 4. code を発行した Client へ Back-Channel Logout を並列送信。失敗しても完了扱い
 * 5. identity DB の記録を revoked にし、監査イベントを残す
 */
export async function revokeSsoSession(
  deps: AuthDeps,
  session: SsoSession,
  reason: SessionRevokeReason,
  environment?: RequestEnvironment,
): Promise<void> {
  const [families, authorizedClients] = await Promise.all([
    deps.stores.sidRefreshFamilies.members(session.sid),
    listAuthorizedClients(deps, session),
  ]);
  await Promise.all(families.map((familyId) => revokeRefreshTokenFamily(deps, familyId)));
  await deps.stores.sidRefreshFamilies.delete(session.sid);

  await revokeCognitoTokens(deps, session);
  await destroySsoSession(deps, session);

  const notifications = await Promise.all(
    authorizedClients.map((clientId) => notifyClient(deps, clientId, session.sid)),
  );
  await deps.sessions.markRevoked(session.sid, reason, deps.clock.nowSeconds());
  await recordAudit(deps, {
    kind: reason === "global_logout" ? "global_logout" : "session_revoked",
    userId: session.userId,
    sessionId: session.sid,
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
  return revokeSsoSession(deps, session, "global_logout", environment);
}

/**
 * sid を指定して失効させる。ポータルからの他端末の失効や管理操作で使う。
 * 揮発ストアに既に無ければ DB の記録だけを revoked にする
 */
export async function revokeSessionBySid(
  deps: AuthDeps,
  sid: string,
  reason: SessionRevokeReason,
  environment?: RequestEnvironment,
): Promise<void> {
  const session = await findSsoSessionBySid(deps, sid);
  if (session !== undefined) {
    await revokeSsoSession(deps, session, reason, environment);
    return;
  }
  await deps.sessions.markRevoked(sid, reason, deps.clock.nowSeconds());
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
  for (const record of affected) {
    const families = await deps.stores.sidRefreshFamilies.members(record.id);
    for (const familyId of families) {
      const described = await describeRefreshTokenFamily(deps, familyId);
      if (described?.clientId === client.clientId && described.tenantId === tenantId) {
        await revokeRefreshTokenFamily(deps, familyId);
      }
    }
    await notifyClient(deps, client.clientId, record.id);
  }
  return affected.map((s) => s.id);
}

async function revokeCognitoTokens(deps: AuthDeps, session: SsoSession): Promise<void> {
  const decrypted = decrypt(session.encryptedCognitoTokens, deps.encryptionKeys);
  if (!decrypted.ok) {
    deps.logger.warn("cognito tokens could not be decrypted on logout", {
      reason: decrypted.error.kind,
    });
    return;
  }
  const parsed: unknown = JSON.parse(decrypted.value);
  const refreshToken =
    typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "refreshToken") : undefined;
  if (typeof refreshToken !== "string") return;
  const revoked = await deps.cognito.revokeRefreshToken(refreshToken);
  if (!revoked.ok) deps.logger.warn("cognito revoke failed", { reason: revoked.error.reason });
}

async function notifyClient(
  deps: AuthDeps,
  clientId: string,
  sid: string,
): Promise<BackchannelResult> {
  const client = await deps.identity.findClient(clientId);
  if (client === undefined || client.status !== "active" || client.backchannelLogoutUri === null) {
    return { clientId, ok: false, reason: "no_backchannel_uri" };
  }
  try {
    const logoutToken = await issueLogoutToken(deps, clientId, sid);
    // 応答しない Client でユーザーのログアウトを待たせない
    const res = await deps.fetch(client.backchannelLogoutUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-store" },
      body: new URLSearchParams({ logout_token: logoutToken }).toString(),
      signal: AbortSignal.timeout(BACKCHANNEL_TIMEOUT_MS),
    });
    if (!res.ok) return { clientId, ok: false, reason: `status ${res.status}` };
    return { clientId, ok: true };
  } catch (error: unknown) {
    return { clientId, ok: false, reason: getErrorMessage(error) };
  }
}
