import {
  computeCodeChallenge,
  err,
  isValidCodeVerifier,
  ok,
  verifySecretAgainstAny,
  type Result,
} from "@sandbox/shared";
import { CONSUMED_CODE_RETENTION_SECONDS } from "../../domain/policy.ts";
import type { OidcClient, Tenant, User } from "../../domain/identity.ts";
import type { IdentityRepository } from "../ports/identity-repository.ts";
import type { AuthorizationCode, RefreshToken } from "../ports/stores.ts";
import { checkTenantAccess } from "./authorize.ts";
import type { AuthDeps } from "../deps.ts";
import { recordAudit } from "./audit.ts";
import { issueTokens } from "./issue-tokens.ts";
import {
  consumeRefreshToken,
  createRefreshTokenFamily,
  describeRefreshTokenFamily,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
} from "./refresh-tokens.ts";
import { loadSsoSessionByKey } from "./sso-session.ts";
import { keyOf } from "./store-keys.ts";

export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: "Bearer";
  readonly expires_in: number;
  readonly id_token: string;
  readonly refresh_token: string;
  readonly scope: string;
}

export type TokenError = { readonly kind: "invalid_grant"; readonly reason: string };

/**
 * client_secret_basic による Client 認証。
 */
export async function authenticateClient(
  identity: IdentityRepository,
  authorizationHeader: string | undefined,
): Promise<Result<OidcClient, { readonly kind: "invalid_client" }>> {
  if (authorizationHeader === undefined || !authorizationHeader.startsWith("Basic "))
    return err({ kind: "invalid_client" });
  const decoded = Buffer.from(authorizationHeader.slice("Basic ".length), "base64").toString(
    "utf8",
  );
  const separator = decoded.indexOf(":");
  if (separator <= 0) return err({ kind: "invalid_client" });
  let clientId: string;
  let clientSecret: string;
  try {
    clientId = decodeURIComponent(decoded.slice(0, separator));
    clientSecret = decodeURIComponent(decoded.slice(separator + 1));
  } catch {
    // 不正な percent-encoding。認証失敗として扱う
    return err({ kind: "invalid_client" });
  }

  const client = await identity.findClient(clientId);
  if (client === undefined || client.status !== "active") return err({ kind: "invalid_client" });
  if (!verifySecretAgainstAny(clientSecret, client.secretHashes))
    return err({ kind: "invalid_client" });
  return ok(client);
}

export interface CodeExchangeInput {
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
}

/**
 * grant_type=authorization_code。docs/design/02-auth-sequences.md の 3.2 に対応する。
 * code は取得と同時に削除し、再利用検知のために used=true の記録を短期間残す。
 */
export async function exchangeAuthorizationCode(
  deps: AuthDeps,
  client: OidcClient,
  input: CodeExchangeInput,
): Promise<Result<TokenResponse, TokenError>> {
  const codeKey = keyOf(input.code);
  const stored = await deps.stores.authorizationCodes.getAndDelete(codeKey);
  if (stored === undefined)
    return err({ kind: "invalid_grant", reason: "code_unknown_or_expired" });
  if (stored.used) {
    const family = await describeRefreshTokenFamily(deps, stored.familyId);
    await revokeRefreshTokenFamily(deps, stored.familyId);
    await rememberConsumedCode(deps, codeKey, stored);
    await recordAudit(deps, {
      kind: "authorization_code_reused",
      userId: family?.userId ?? null,
      sessionId: family?.sid ?? null,
      tenantId: family?.tenantId ?? null,
      clientId: client.clientId,
      detail: { familyId: stored.familyId },
    });
    return err({ kind: "invalid_grant", reason: "code_reused" });
  }

  const validation = validateCodeBinding(stored, client, input);
  if (!validation.ok) return validation;

  const [session, user, tenant] = await Promise.all([
    loadSsoSessionByKey(deps, stored.ssoSessionId),
    deps.identity.findUserById(stored.userId),
    resolveTenant(deps, stored.tenantId),
  ]);
  if (session === undefined) return err({ kind: "invalid_grant", reason: "sso_session_expired" });
  if (user === undefined) return err({ kind: "invalid_grant", reason: "user_missing" });
  if (!tenant.ok) return tenant;

  const [refreshToken, tokens] = await Promise.all([
    createRefreshTokenFamily(deps, {
      clientId: client.clientId,
      userId: stored.userId,
      tenantId: stored.tenantId,
      sid: stored.sid,
      ssoSessionId: stored.ssoSessionId,
      scope: stored.scope,
      authTime: stored.authTime,
    }),
    issueTokens(deps, {
      client,
      user,
      scope: stored.scope,
      nonce: stored.nonce,
      sid: stored.sid,
      tenant: tenant.value,
      authTime: stored.authTime,
    }),
  ]);
  await rememberConsumedCode(deps, codeKey, { used: true, familyId: refreshToken.record.familyId });
  deps.logger.info("tokens issued via authorization_code", {
    clientId: client.clientId,
    userId: user.id,
  });
  return ok(toResponse(tokens, refreshToken.value, stored.scope));
}

function validateCodeBinding(
  stored: Extract<AuthorizationCode, { used: false }>,
  client: OidcClient,
  input: CodeExchangeInput,
): Result<void, TokenError> {
  if (stored.clientId !== client.clientId)
    return err({ kind: "invalid_grant", reason: "client_mismatch" });
  if (stored.redirectUri !== input.redirectUri)
    return err({ kind: "invalid_grant", reason: "redirect_uri_mismatch" });
  if (!isValidCodeVerifier(input.codeVerifier)) {
    return err({ kind: "invalid_grant", reason: "code_verifier_invalid" });
  }
  if (computeCodeChallenge(input.codeVerifier) !== stored.codeChallenge) {
    return err({ kind: "invalid_grant", reason: "pkce_mismatch" });
  }
  return ok(undefined);
}

function rememberConsumedCode(
  deps: AuthDeps,
  codeKey: string,
  consumed: Extract<AuthorizationCode, { used: true }>,
): Promise<void> {
  return deps.stores.authorizationCodes.set(codeKey, consumed, CONSUMED_CODE_RETENTION_SECONDS);
}

/**
 * grant_type=refresh_token。docs/design/02-auth-sequences.md の 3.3 に対応する。
 */
export async function refreshAccessToken(
  deps: AuthDeps,
  client: OidcClient,
  refreshTokenValue: string,
): Promise<Result<TokenResponse, TokenError>> {
  // 先に一回限りで消費する。同じ値を同時に提示されても成功するのは 1 つだけ
  const consumed = await consumeRefreshToken(deps, refreshTokenValue);
  if (consumed.kind === "unknown")
    return err({ kind: "invalid_grant", reason: "refresh_token_unknown_or_expired" });
  if (consumed.kind === "reused") {
    await revokeRefreshTokenFamily(deps, consumed.token.familyId);
    await recordAudit(deps, {
      kind: "refresh_token_reused",
      userId: consumed.token.userId,
      sessionId: consumed.token.sid,
      tenantId: consumed.token.tenantId,
      clientId: client.clientId,
      detail: { familyId: consumed.token.familyId, tokenClientId: consumed.token.clientId },
    });
    return err({ kind: "invalid_grant", reason: "refresh_token_reused" });
  }
  const stored = consumed.token;
  if (stored.clientId !== client.clientId) {
    // 別 Client から提示された Token は漏洩とみなし、系列ごと失効させる
    await revokeRefreshTokenFamily(deps, stored.familyId);
    await recordAudit(deps, {
      kind: "refresh_token_client_mismatch",
      userId: stored.userId,
      sessionId: stored.sid,
      tenantId: stored.tenantId,
      clientId: client.clientId,
      detail: { familyId: stored.familyId, tokenClientId: stored.clientId },
    });
    return err({ kind: "invalid_grant", reason: "client_mismatch" });
  }

  const validated = await validateRefreshContext(deps, client, stored);
  if (!validated.ok) {
    // SSO Session 切れ、契約解除、Membership 削除のいずれでも系列ごと失効させる
    await revokeRefreshTokenFamily(deps, stored.familyId);
    return validated;
  }
  const { user, tenant } = validated.value;

  const [next, tokens] = await Promise.all([
    rotateRefreshToken(deps, stored),
    issueTokens(deps, {
      client,
      user,
      scope: stored.scope,
      nonce: undefined,
      sid: stored.sid,
      tenant,
      authTime: stored.authTime,
    }),
  ]);
  deps.logger.info("tokens issued via refresh_token", {
    clientId: client.clientId,
    userId: user.id,
  });
  return ok(toResponse(tokens, next.value, stored.scope));
}

/** Refresh 時に SSO Session の生存とテナントアクセスを再確認する */
async function validateRefreshContext(
  deps: AuthDeps,
  client: OidcClient,
  stored: RefreshToken,
): Promise<Result<{ user: User; tenant: Tenant }, TokenError>> {
  const [session, tenant] = await Promise.all([
    loadSsoSessionByKey(deps, stored.ssoSessionId),
    resolveTenant(deps, stored.tenantId),
  ]);
  if (session === undefined) return err({ kind: "invalid_grant", reason: "sso_session_expired" });
  if (!tenant.ok) return tenant;
  const access = await checkTenantAccess(deps.identity, client, tenant.value, stored.userId);
  if (!access.ok) return err({ kind: "invalid_grant", reason: access.error.reason });
  return ok({ user: access.value, tenant: tenant.value });
}

/**
 * RFC 7009。存在しない Token でも成功として扱う。
 */
export async function revokeRefreshToken(
  deps: AuthDeps,
  client: OidcClient,
  tokenValue: string,
): Promise<void> {
  const stored: RefreshToken | undefined = await deps.stores.refreshTokens.get(keyOf(tokenValue));
  if (stored === undefined || stored.clientId !== client.clientId) return;
  await revokeRefreshTokenFamily(deps, stored.familyId);
}

/** code や Refresh Token に紐付いたテナントを引く */
async function resolveTenant(
  deps: AuthDeps,
  tenantId: string,
): Promise<Result<Tenant, TokenError>> {
  const tenant = await deps.identity.findTenantById(tenantId);
  if (tenant === undefined) return err({ kind: "invalid_grant", reason: "tenant_missing" });
  return ok(tenant);
}

function toResponse(
  tokens: { idToken: string; accessToken: string; expiresIn: number },
  refreshToken: string,
  scope: string,
): TokenResponse {
  return {
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    id_token: tokens.idToken,
    refresh_token: refreshToken,
    scope,
  };
}
