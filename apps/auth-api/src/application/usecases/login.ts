import { err, ok, randomToken, type Result } from "@sandbox/shared";
import { ulid } from "ulid";
import { MFA_PENDING_TTL_SECONDS } from "../../domain/policy.ts";
import type { MfaMethod, User } from "../../domain/identity.ts";
import type { RequestEnvironment } from "../../domain/session.ts";
import type {
  CognitoAuthenticated,
  CognitoAuthError,
  CognitoCredentials,
} from "../ports/cognito.ts";
import type { MfaPending, SsoSession } from "../ports/stores.ts";
import type { AuthDeps } from "../deps.ts";
import { recordAudit } from "./audit.ts";
import { sealCognitoTokens } from "./cognito-tokens.ts";
import { createSsoSession } from "./sso-session.ts";
import { keyOf } from "./store-keys.ts";

export type LoginError = CognitoAuthError;

export interface LoginSuccess {
  readonly user: User;
  readonly session: SsoSession;
  /** Cookie に入れる値 */
  readonly cookieValue: string;
}

/**
 * パスワード認証の結果。MFA は全員必須なので、SSO Session ができるのは MFA を終えた後だけ。
 *   totp_required  : 登録済み。認証アプリのコードを求める
 *   setup_required : 未登録。認証アプリの登録を求める
 */
export type LoginOutcome =
  | { readonly kind: "totp_required"; readonly pendingId: string }
  | { readonly kind: "setup_required"; readonly pendingId: string };

/**
 * Cognito でパスワード認証し、MFA の保留状態を作る。
 * 登録済みの人には Cognito がチャレンジを返す。未登録の人は Token が返るが、登録が終わるまで SSO Session を作らない。
 * テナントやサービスへのアクセス可否はここでは判定しない。認証と認可を分けるため。
 */
export async function login(
  deps: AuthDeps,
  credentials: CognitoCredentials,
  environment: RequestEnvironment,
  rid: string,
): Promise<Result<LoginOutcome, LoginError>> {
  const outcome = await deps.cognito.authenticate(credentials);
  if (!outcome.ok) {
    // ユーザー名は残さない。列挙の材料になる
    await recordAudit(deps, {
      kind: "login_failed",
      ip: environment.ip,
      userAgent: environment.userAgent,
      detail: { reason: outcome.error.kind },
    });
    return outcome;
  }

  if (outcome.value.kind === "totp_required") {
    const pendingId = await storePending(deps, {
      kind: "totp_challenge",
      username: outcome.value.username,
      cognitoSession: outcome.value.session,
      rid,
      attempts: 0,
    });
    return ok({ kind: "totp_required", pendingId });
  }

  const { authenticated } = outcome.value;
  const pendingId = await storePending(deps, {
    kind: "totp_setup",
    sub: authenticated.sub,
    email: authenticated.email,
    name: authenticated.name ?? null,
    encryptedTokens: sealCognitoTokens(deps, authenticated.tokens),
    rid,
    encryptedSecret: null,
    secretIssuedAt: null,
  });
  return ok({ kind: "setup_required", pendingId });
}

/**
 * MFA を終えた認証結果から users を確定し、SSO Session を作る。
 * users の解決順:
 *   1. cognito_sub が一致する行
 *   2. 招待で事前作成された、同じメールで cognito_sub が未設定の行。ここで sub を紐付ける
 *   3. どちらも無ければ JIT 作成
 */
export async function finishLogin(
  deps: AuthDeps,
  authenticated: CognitoAuthenticated,
  environment: RequestEnvironment,
  method: MfaMethod,
): Promise<Result<LoginSuccess, { kind: "user_disabled" }>> {
  const { sub, email, name } = authenticated;
  const user = await resolveUser(deps, sub, email, name ?? null);
  if (user.status !== "active") {
    await recordAudit(deps, {
      kind: "login_failed",
      userId: user.id,
      ip: environment.ip,
      userAgent: environment.userAgent,
      detail: { reason: "user_disabled" },
    });
    return err({ kind: "user_disabled" });
  }
  // Cognito 側で登録済みなのに記録が無い人は、ここで記録を合わせる
  await deps.identity.recordMfaMethod(user.id, method, deps.clock.nowSeconds());

  const created = await createSsoSession(deps, user, authenticated, environment);
  await recordAudit(deps, {
    kind: "login_succeeded",
    userId: user.id,
    sessionId: created.session.sid,
    ip: environment.ip,
    userAgent: environment.userAgent,
    detail: { mfa: method },
  });
  return ok({ user, session: created.session, cookieValue: created.cookieValue });
}

export function loadPending(deps: AuthDeps, pendingId: string): Promise<MfaPending | undefined> {
  return deps.stores.mfaPending.get(keyOf(pendingId));
}

export function savePending(deps: AuthDeps, pendingId: string, pending: MfaPending): Promise<void> {
  return deps.stores.mfaPending.set(keyOf(pendingId), pending, MFA_PENDING_TTL_SECONDS);
}

/** 期限を延ばさずに値だけを書き換える。失敗回数の更新に使う */
export function updatePending(
  deps: AuthDeps,
  pendingId: string,
  pending: MfaPending,
): Promise<boolean> {
  return deps.stores.mfaPending.update(keyOf(pendingId), pending);
}

export function deletePending(deps: AuthDeps, pendingId: string): Promise<void> {
  return deps.stores.mfaPending.delete(keyOf(pendingId));
}

async function storePending(deps: AuthDeps, pending: MfaPending): Promise<string> {
  const pendingId = randomToken();
  await savePending(deps, pendingId, pending);
  return pendingId;
}

async function resolveUser(
  deps: AuthDeps,
  cognitoSub: string,
  email: string,
  name: string | null,
): Promise<User> {
  const bySub = await deps.identity.findUserByCognitoSub(cognitoSub);
  if (bySub !== undefined) return bySub;

  const byEmail = await deps.identity.findUserByEmail(email);
  if (byEmail !== undefined) {
    if (byEmail.cognitoSub !== null) {
      // 同じメールで別の Cognito ユーザー。既存行は触らず新規行も作らない。呼び出し側で無効扱いにする
      deps.logger.warn("email already linked to another cognito user", { userId: byEmail.id });
      return { ...byEmail, status: "disabled" };
    }
    deps.logger.info("linking invited user to cognito sub", { userId: byEmail.id });
    return deps.identity.linkCognitoSub(byEmail.id, cognitoSub);
  }

  deps.logger.info("creating user on first login");
  return deps.identity.createUser({ id: ulid(), cognitoSub, email, name });
}
