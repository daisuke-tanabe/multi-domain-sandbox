import { err, ok, randomToken, type AccessDeniedReason, type Result } from "@sandbox/shared";
import { AUTHORIZATION_CODE_TTL_SECONDS } from "../policy.ts";
import type { IdentityRepository, OidcClient, Tenant, User } from "../ports/identity-repository.ts";
import type { AuthorizationCode, SsoSession } from "../ports/stores.ts";
import type { ValidatedAuthorizationRequest } from "./authorization-request.ts";
import type { AuthDeps } from "./deps.ts";
import { touchSsoSession } from "./sso-session.ts";

export type AccessCheckError = {
  readonly kind: "access_denied";
  readonly reason: AccessDeniedReason;
};

/**
 * ユーザーがこのサービスのこのテナントへアクセスできるか判定し、通れば User を返す。
 *   1. ユーザーが active
 *   2. テナントが active
 *   3. テナントがこのサービスを契約している (tenant_services)
 *   4. ユーザーがテナントに active で所属している (tenant_members)
 * 契約と Membership は独立なので並列に引き、判定は上の順で行う。
 */
export async function checkTenantAccess(
  identity: IdentityRepository,
  client: OidcClient,
  tenant: Tenant,
  userId: string,
): Promise<Result<User, AccessCheckError>> {
  const [user, contract, membership] = await Promise.all([
    identity.findUserById(userId),
    identity.findContract(tenant.id, client.id),
    identity.findMembership(tenant.id, userId),
  ]);
  if (user === undefined || user.status !== "active")
    return err({ kind: "access_denied", reason: "user_disabled" });
  if (tenant.status !== "active") return err({ kind: "access_denied", reason: "tenant_suspended" });
  if (contract === undefined || contract.status !== "active")
    return err({ kind: "access_denied", reason: "not_contracted" });
  if (membership === undefined) return err({ kind: "access_denied", reason: "no_membership" });
  if (membership.status !== "active")
    return err({ kind: "access_denied", reason: "membership_inactive" });
  return ok(user);
}

export interface IssuedCode {
  readonly code: string;
}

/**
 * 有効な SSO Session に対して Authorization Code を発行する。
 * docs/design/02-auth-sequences.md の 3.1 のアクセス判定以降に対応する。
 */
export async function authorizeWithSession(
  deps: AuthDeps,
  request: ValidatedAuthorizationRequest,
  session: SsoSession,
): Promise<Result<IssuedCode, AccessCheckError>> {
  const access = await checkTenantAccess(
    deps.identity,
    request.client,
    request.tenant,
    session.userId,
  );
  if (!access.ok) {
    deps.logger.info("authorize denied", {
      clientId: request.client.clientId,
      tenant: request.tenant.slug,
      userId: session.userId,
      reason: access.error.reason,
    });
    return access;
  }

  const code: AuthorizationCode = {
    used: false,
    code: randomToken(),
    clientId: request.client.clientId,
    redirectUri: request.redirectUri,
    scope: request.scope,
    nonce: request.nonce,
    codeChallenge: request.codeChallenge,
    userId: session.userId,
    tenantId: request.tenant.id,
    sid: session.sid,
    ssoSessionId: session.id,
    authTime: session.authTime,
  };
  await deps.stores.authorizationCodes.set(code.code, code, AUTHORIZATION_CODE_TTL_SECONDS);
  await touchSsoSession(deps, session, request.client.clientId);
  deps.logger.info("authorization code issued", {
    clientId: request.client.clientId,
    tenant: request.tenant.slug,
    userId: session.userId,
  });
  return ok({ code: code.code });
}
