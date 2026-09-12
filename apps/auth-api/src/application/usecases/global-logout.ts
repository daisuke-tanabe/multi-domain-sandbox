import { decrypt, getErrorMessage, randomToken, signJwt } from "@sandbox/shared";
import { BACKCHANNEL_TIMEOUT_MS, LOGOUT_TOKEN_TTL_SECONDS } from "../../domain/policy.ts";
import type { SsoSession } from "../ports/stores.ts";
import type { AuthDeps } from "../deps.ts";
import { revokeRefreshTokenFamily } from "./refresh-tokens.ts";
import { destroySsoSession, listAuthorizedClients } from "./sso-session.ts";

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
 * Global Logout。docs/design/02-auth-sequences.md の 11 に対応する。
 * 1. sid に紐付く Refresh Token 系列を全失効
 * 2. Cognito Refresh Token を失効
 * 3. SSO Session を削除
 * 4. code を発行した Client へ Back-Channel Logout を並列送信。失敗しても完了扱い
 */
export async function globalLogout(deps: AuthDeps, session: SsoSession): Promise<void> {
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
  deps.logger.info("global logout completed", {
    userId: session.userId,
    notified: notifications.filter((n) => n.ok).map((n) => n.clientId),
    failed: notifications.filter((n) => !n.ok).map((n) => n.clientId),
  });
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
