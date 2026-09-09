import { err, ok, randomToken, type Result } from "@sandbox/shared";
import { AUTHORIZATION_CODE_TTL_SECONDS } from "../policy.ts";
import type { IdentityRepository, OidcClient } from "../ports/identity-repository.ts";
import type { AuthorizationCode, SsoSession } from "../ports/stores.ts";
import type { ValidatedAuthorizationRequest } from "./authorization-request.ts";
import type { AuthDeps } from "./deps.ts";
import { touchSsoSession } from "./sso-session.ts";

export type AccessDeniedReason =
  | "user_disabled"
  | "tenant_suspended"
  | "no_membership"
  | "membership_inactive";

export type AccessCheckError = {
  readonly kind: "access_denied";
  readonly reason: AccessDeniedReason;
};

/**
 * テナント用 Client に対して、ユーザーがそのテナントへアクセスできるか判定する。
 * tenant を持たない Client はテナント判定をスキップする。
 */
export async function checkTenantAccess(
  identity: IdentityRepository,
  client: OidcClient,
  userId: string,
): Promise<Result<{ tenantId: string | null }, AccessCheckError>> {
  const user = await identity.findUserById(userId);
  if (user === undefined || user.status !== "active")
    return err({ kind: "access_denied", reason: "user_disabled" });
  if (client.tenant === null) return ok({ tenantId: null });
  if (client.tenant.status !== "active")
    return err({ kind: "access_denied", reason: "tenant_suspended" });

  const membership = await identity.findMembership(client.tenant.id, userId);
  if (membership === undefined) return err({ kind: "access_denied", reason: "no_membership" });
  if (membership.status !== "active")
    return err({ kind: "access_denied", reason: "membership_inactive" });
  return ok({ tenantId: client.tenant.id });
}

export interface IssuedCode {
  readonly code: string;
  readonly redirectUri: string;
  readonly state: string;
}

/**
 * 有効な SSO Session に対して Authorization Code を発行する。
 * docs/design/02-auth-sequences.md の 3.1 の Membership 判定以降に対応する。
 */
export async function authorizeWithSession(
  deps: AuthDeps,
  request: ValidatedAuthorizationRequest,
  session: SsoSession,
): Promise<Result<IssuedCode, AccessCheckError>> {
  const access = await checkTenantAccess(deps.identity, request.client, session.userId);
  if (!access.ok) {
    deps.logger.info("authorize denied", {
      clientId: request.client.clientId,
      userId: session.userId,
      reason: access.error.reason,
    });
    return access;
  }

  const now = deps.clock.nowSeconds();
  const code: AuthorizationCode = {
    used: false,
    code: randomToken(),
    clientId: request.client.clientId,
    redirectUri: request.redirectUri,
    scope: request.scope,
    nonce: request.nonce,
    codeChallenge: request.codeChallenge,
    userId: session.userId,
    tenantId: access.value.tenantId,
    sid: session.sid,
    ssoSessionId: session.id,
    authTime: session.authTime,
    createdAt: now,
  };
  await deps.stores.authorizationCodes.set(code.code, code, AUTHORIZATION_CODE_TTL_SECONDS);
  await touchSsoSession(deps, session, request.client.clientId);
  deps.logger.info("authorization code issued", {
    clientId: request.client.clientId,
    userId: session.userId,
  });
  return ok({ code: code.code, redirectUri: request.redirectUri, state: request.state });
}
