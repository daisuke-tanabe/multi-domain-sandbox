import { err, randomToken, type Result } from "@sandbox/shared";
import { AUTHORIZATION_REQUEST_TTL_SECONDS } from "../../domain/policy.ts";
import type { AuthorizationRequest, SsoSession } from "../ports/stores.ts";
import type { ValidatedAuthorizationRequest } from "./authorization-request.ts";
import { authorizeWithSession, type AccessCheckError, type IssuedCode } from "./authorize.ts";
import type { AuthDeps } from "../deps.ts";

/**
 * SSO Session がないとき、検証済みの認可リクエストを rid で保存してログイン画面へ渡す。
 */
export async function storePendingAuthorization(
  deps: AuthDeps,
  request: ValidatedAuthorizationRequest,
): Promise<string> {
  const rid = randomToken();
  const pending: AuthorizationRequest = {
    clientId: request.client.clientId,
    tenantId: request.tenant.id,
    redirectUri: request.redirectUri,
    scope: request.scope,
    state: request.state,
    nonce: request.nonce,
    codeChallenge: request.codeChallenge,
  };
  await deps.stores.authorizationRequests.set(rid, pending, AUTHORIZATION_REQUEST_TTL_SECONDS);
  return rid;
}

export type ResumeError =
  | AccessCheckError
  /** ログイン中に Client やテナントが無効化された */
  | { readonly kind: "invalid_request" };

/**
 * ログイン成功後、保存しておいた認可リクエストに対して code を発行する。
 * パラメータは保存時に検証済みなので、Client とテナントがまだ有効かだけを確かめる。
 */
export async function resumePendingAuthorization(
  deps: AuthDeps,
  pending: AuthorizationRequest,
  session: SsoSession,
): Promise<Result<IssuedCode, ResumeError>> {
  const [client, tenant] = await Promise.all([
    deps.identity.findClient(pending.clientId),
    deps.identity.findTenantById(pending.tenantId),
  ]);
  if (client === undefined || client.status !== "active" || tenant === undefined) {
    return err({ kind: "invalid_request" });
  }
  return authorizeWithSession(deps, { ...pending, client, tenant }, session);
}
