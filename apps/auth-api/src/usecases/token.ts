import {
  computeCodeChallenge,
  err,
  isValidCodeVerifier,
  ok,
  verifySecret,
  type Result,
} from "@sandbox/shared";
import { CONSUMED_CODE_RETENTION_SECONDS } from "../policy.ts";
import type { IdentityRepository, OidcClient, Tenant } from "../ports/identity-repository.ts";
import type { AuthorizationCode, RefreshToken } from "../ports/stores.ts";
import { checkTenantAccess } from "./authorize.ts";
import type { AuthDeps } from "./deps.ts";
import { issueTokens } from "./issue-tokens.ts";
import {
  createRefreshTokenFamily,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
} from "./refresh-tokens.ts";
import { loadSsoSession } from "./sso-session.ts";

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
  const clientId = decodeURIComponent(decoded.slice(0, separator));
  const clientSecret = decodeURIComponent(decoded.slice(separator + 1));

  const client = await identity.findClient(clientId);
  if (client === undefined || client.status !== "active") return err({ kind: "invalid_client" });
  if (!verifySecret(clientSecret, client.clientSecretHash)) return err({ kind: "invalid_client" });
  return ok(client);
}

export interface CodeExchangeInput {
  readonly code: string | undefined;
  readonly redirectUri: string | undefined;
  readonly codeVerifier: string | undefined;
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
  if (input.code === undefined || input.code === "")
    return err({ kind: "invalid_grant", reason: "code_missing" });

  const stored = await deps.stores.authorizationCodes.getAndDelete(input.code);
  if (stored === undefined)
    return err({ kind: "invalid_grant", reason: "code_unknown_or_expired" });
  if (stored.used) {
    deps.logger.warn("authorization code reuse detected", { clientId: client.clientId });
    await revokeRefreshTokenFamily(deps, stored.familyId);
    await rememberConsumedCode(deps, stored);
    return err({ kind: "invalid_grant", reason: "code_reused" });
  }

  const validation = validateCodeBinding(stored, client, input);
  if (!validation.ok) return validation;

  const session = await loadSsoSession(deps, stored.ssoSessionId);
  if (session === undefined) return err({ kind: "invalid_grant", reason: "sso_session_expired" });

  const user = await deps.identity.findUserById(stored.userId);
  if (user === undefined) return err({ kind: "invalid_grant", reason: "user_missing" });
  const tenant = await resolveTenant(deps, stored.tenantId);
  if (!tenant.ok) return tenant;

  const refreshToken = await createRefreshTokenFamily(deps, {
    clientId: client.clientId,
    userId: stored.userId,
    tenantId: stored.tenantId,
    sid: stored.sid,
    ssoSessionId: stored.ssoSessionId,
    scope: stored.scope,
    authTime: stored.authTime,
  });
  await rememberConsumedCode(deps, {
    used: true,
    code: stored.code,
    familyId: refreshToken.familyId,
  });

  const tokens = await issueTokens(deps, {
    client,
    user,
    scope: stored.scope,
    nonce: stored.nonce,
    sid: stored.sid,
    tenant: tenant.value,
    authTime: stored.authTime,
  });
  deps.logger.info("tokens issued via authorization_code", {
    clientId: client.clientId,
    userId: user.id,
  });
  return ok(toResponse(tokens, refreshToken.token, stored.scope));
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
  if (input.codeVerifier === undefined || !isValidCodeVerifier(input.codeVerifier)) {
    return err({ kind: "invalid_grant", reason: "code_verifier_invalid" });
  }
  if (computeCodeChallenge(input.codeVerifier) !== stored.codeChallenge) {
    return err({ kind: "invalid_grant", reason: "pkce_mismatch" });
  }
  return ok(undefined);
}

function rememberConsumedCode(
  deps: AuthDeps,
  consumed: Extract<AuthorizationCode, { used: true }>,
): Promise<void> {
  return deps.stores.authorizationCodes.set(
    consumed.code,
    consumed,
    CONSUMED_CODE_RETENTION_SECONDS,
  );
}

/**
 * grant_type=refresh_token。docs/design/02-auth-sequences.md の 3.3 に対応する。
 */
export async function refreshAccessToken(
  deps: AuthDeps,
  client: OidcClient,
  refreshTokenValue: string | undefined,
): Promise<Result<TokenResponse, TokenError>> {
  if (refreshTokenValue === undefined || refreshTokenValue === "") {
    return err({ kind: "invalid_grant", reason: "refresh_token_missing" });
  }
  const stored = await deps.stores.refreshTokens.get(refreshTokenValue);
  if (stored === undefined)
    return err({ kind: "invalid_grant", reason: "refresh_token_unknown_or_expired" });
  if (stored.clientId !== client.clientId)
    return err({ kind: "invalid_grant", reason: "client_mismatch" });
  if (stored.status !== "active") {
    deps.logger.warn("refresh token reuse detected", {
      clientId: client.clientId,
      familyId: stored.familyId,
    });
    await revokeRefreshTokenFamily(deps, stored.familyId);
    return err({ kind: "invalid_grant", reason: "refresh_token_reused" });
  }

  const session = await loadSsoSession(deps, stored.ssoSessionId);
  if (session === undefined) {
    await revokeRefreshTokenFamily(deps, stored.familyId);
    return err({ kind: "invalid_grant", reason: "sso_session_expired" });
  }

  const tenant = await resolveTenant(deps, stored.tenantId);
  if (!tenant.ok) {
    await revokeRefreshTokenFamily(deps, stored.familyId);
    return tenant;
  }
  const access = await checkTenantAccess(deps.identity, client, tenant.value, stored.userId);
  if (!access.ok) {
    await revokeRefreshTokenFamily(deps, stored.familyId);
    return err({ kind: "invalid_grant", reason: access.error.reason });
  }
  const user = await deps.identity.findUserById(stored.userId);
  if (user === undefined) return err({ kind: "invalid_grant", reason: "user_missing" });

  const next = await rotateRefreshToken(deps, stored);
  const tokens = await issueTokens(deps, {
    client,
    user,
    scope: stored.scope,
    nonce: undefined,
    sid: stored.sid,
    tenant: tenant.value,
    authTime: stored.authTime,
  });
  deps.logger.info("tokens issued via refresh_token", {
    clientId: client.clientId,
    userId: user.id,
  });
  return ok(toResponse(tokens, next.token, stored.scope));
}

/**
 * RFC 7009。存在しない Token でも成功として扱う。
 */
export async function revokeRefreshToken(
  deps: AuthDeps,
  client: OidcClient,
  tokenValue: string | undefined,
): Promise<void> {
  if (tokenValue === undefined || tokenValue === "") return;
  const stored: RefreshToken | undefined = await deps.stores.refreshTokens.get(tokenValue);
  if (stored === undefined || stored.clientId !== client.clientId) return;
  await revokeRefreshTokenFamily(deps, stored.familyId);
}

/** code や Refresh Token に紐付いたテナントを引く。テナントなしの Client は null */
async function resolveTenant(
  deps: AuthDeps,
  tenantId: string | null,
): Promise<Result<Tenant | null, TokenError>> {
  if (tenantId === null) return ok(null);
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
