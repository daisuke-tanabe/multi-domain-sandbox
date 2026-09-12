import { err, ok, type Result } from "@sandbox/shared";
import { ulid } from "ulid";
import type { CognitoAuthError, CognitoCredentials } from "../ports/cognito.ts";
import type { User } from "../../domain/identity.ts";
import type { RequestEnvironment } from "../../domain/session.ts";
import type { SsoSession } from "../ports/stores.ts";
import type { AuthDeps } from "../deps.ts";
import { recordAudit } from "./audit.ts";
import { createSsoSession } from "./sso-session.ts";

export type LoginError = CognitoAuthError | { kind: "user_disabled" };

export interface LoginSuccess {
  readonly user: User;
  readonly session: SsoSession;
  /** Cookie に入れる値 */
  readonly cookieValue: string;
}

/**
 * Cognito で認証し、users を確定した上で SSO Session を作る。
 * users の解決順:
 *   1. cognito_sub が一致する行
 *   2. 招待で事前作成された、同じメールで cognito_sub が未設定の行。ここで sub を紐付ける
 *   3. どちらも無ければ JIT 作成
 * テナントやサービスへのアクセス可否はここでは判定しない。認証と認可を分けるため。
 */
export async function login(
  deps: AuthDeps,
  credentials: CognitoCredentials,
  environment: RequestEnvironment,
): Promise<Result<LoginSuccess, LoginError>> {
  const authenticated = await deps.cognito.authenticate(credentials);
  if (!authenticated.ok) {
    // ユーザー名は残さない。列挙の材料になる
    await recordAudit(deps, {
      kind: "login_failed",
      ip: environment.ip,
      userAgent: environment.userAgent,
      detail: { reason: authenticated.error.kind },
    });
    return authenticated;
  }
  const { sub, email, name } = authenticated.value;

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

  const created = await createSsoSession(deps, user, authenticated.value, environment);
  await recordAudit(deps, {
    kind: "login_succeeded",
    userId: user.id,
    sessionId: created.session.sid,
    ip: environment.ip,
    userAgent: environment.userAgent,
  });
  return ok({ user, session: created.session, cookieValue: created.cookieValue });
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
