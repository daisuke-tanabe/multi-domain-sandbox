import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type {
  LoginChallengeResponse,
  LoginContextResponse,
  LoginRedirectResponse,
  MfaSetupResponse,
} from "@sandbox/api-contract";
import type { CookiePolicy } from "@sandbox/shared";
import { issueCsrfToken } from "../../../application/usecases/csrf.ts";
import type { AuthDeps } from "../../../application/deps.ts";
import { login, type LoginSuccess } from "../../../application/usecases/login.ts";
import {
  beginTotpSetup,
  completeTotpChallenge,
  completeTotpSetup,
  type MfaFlowError,
} from "../../../application/usecases/mfa.ts";
import {
  consumePendingAuthorization,
  loadPendingAuthorization,
  resumePendingAuthorization,
} from "../../../application/usecases/pending-authorization.ts";
import { destroySsoSession, loadSsoSession } from "../../../application/usecases/sso-session.ts";
import { errorPage } from "../views/pages.ts";
import {
  csrfCookie,
  invalidForm,
  redirectForOutcome,
  rejectInvalidCsrf,
  requestEnvironment,
  ssoCookie,
  withQuery,
} from "./helpers.ts";

const loginFormSchema = z.object({
  rid: z.string().default(""),
  csrf: z.string().min(1),
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
});

const codeFormSchema = z.object({
  mid: z.string().min(1).max(128),
  csrf: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

/** /login?error= と /login/challenge?error= に載せる種類。文言は /api/login 系が返す */
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_credentials: "ユーザー名またはパスワードが正しくありません",
  user_disabled: "ユーザー名またはパスワードが正しくありません",
  user_not_confirmed: "アカウントが確認されていません",
  password_reset_required: "パスワードの再設定が必要です",
  challenge_required: "この認証方式は現在未対応です",
  unavailable: "一時的なエラーです。しばらくしてから再試行してください",
  challenge_expired: "時間切れです。もう一度ログインしてください",
  code_mismatch: "コードが正しくありません。認証アプリの最新のコードを入力してください",
  setup_expired: "QR コードの有効期限が切れました。新しい QR コードを読み取ってください",
};

const EXPIRED_REQUEST_MESSAGE =
  "ログイン画面を開いてから時間が経ちすぎたか、認証サーバーが再起動しました。利用したいサービスの URL をブラウザで開き直してログインしてください。";
const EXPIRED_MFA_MESSAGE = "時間切れです。もう一度ログインしてください。";

function errorMessageOf(c: Context): { errorMessage: string } | Record<never, never> {
  const message = ERROR_MESSAGES[c.req.query("error") ?? ""];
  return message === undefined ? {} : { errorMessage: message };
}

/**
 * ログイン。画面は apps/auth-web の SPA が描く。MFA は全員必須。
 *   GET  /api/login              SPA がフォームを描くための rid、CSRF、エラー文言
 *   POST /login                  フォーム POST。パスワード認証のあと TOTP のチャレンジか登録へ 303
 *   GET  /api/login/challenge    認証アプリのコード入力画面の材料
 *   POST /login/challenge        コードを検証し、通れば /authorize の続きへ
 *   GET  /api/login/mfa-setup    QR コードの材料。期限が来たら renew=1 で新しい secret を発行
 *   POST /login/mfa-setup        登録中の secret のコードを検証し、TOTP を必須にしてログインを完了する
 */
export function loginRoutes(deps: AuthDeps, policy: CookiePolicy): Hono {
  const app = new Hono();
  const sso = ssoCookie(policy);
  const csrf = csrfCookie(policy);

  const issueCsrf = async (c: Context): Promise<string> => {
    const issued = await issueCsrfToken(deps);
    csrf.write(c, issued.cookieValue);
    return issued.formToken;
  };

  /** MFA を終えたログインの仕上げ。Cookie を書き、保留していた認可リクエストを再開する */
  const finish = async (c: Context, result: LoginSuccess, rid: string): Promise<Response> => {
    // 古い SSO Session を残さない。Cookie を上書きするだけでは前のセッションが期限まで生き続ける
    const previous = await loadSsoSession(deps, sso.read(c));
    if (previous !== undefined) await destroySsoSession(deps, previous);
    sso.write(c, result.cookieValue);
    const request = rid === "" ? undefined : await consumePendingAuthorization(deps, rid);
    if (request === undefined) return c.redirect("/", 303);
    const outcome = await resumePendingAuthorization(
      deps,
      request,
      result.session,
      requestEnvironment(c),
    );
    return c.redirect(redirectForOutcome(deps.issuer, request, outcome), 303);
  };

  const respondMfaError = (
    c: Context,
    error: MfaFlowError,
    retryPath: string,
    mid: string,
  ): Response => {
    switch (error.kind) {
      case "code_mismatch":
      case "setup_expired":
        return c.redirect(withQuery(retryPath, { mid, error: error.kind }), 303);
      case "expired":
        return c.redirect(withQuery("/login", { error: "challenge_expired" }), 303);
      case "user_disabled":
      case "unavailable":
        return c.redirect(withQuery("/login", { error: error.kind }), 303);
    }
  };

  app.get("/api/login", async (c) => {
    const rid = c.req.query("rid") ?? "";
    if (rid !== "") {
      if ((await loadPendingAuthorization(deps, rid)) === undefined) {
        return c.json({ error: "expired_request", message: EXPIRED_REQUEST_MESSAGE }, 400);
      }
    } else {
      // rid なしはポータル用ログイン。既に SSO Session があればポータルへ
      const session = await loadSsoSession(deps, sso.read(c));
      if (session !== undefined) return c.json({ redirectTo: "/" } satisfies LoginRedirectResponse);
    }
    return c.json({
      rid,
      csrfToken: await issueCsrf(c),
      ...errorMessageOf(c),
    } satisfies LoginContextResponse);
  });

  app.post("/login", zValidator("form", loginFormSchema, invalidForm), async (c) => {
    const form = c.req.valid("form");
    const rejected = await rejectInvalidCsrf(c, deps, policy, form.csrf);
    if (rejected !== undefined) return rejected;
    if (form.rid !== "" && (await loadPendingAuthorization(deps, form.rid)) === undefined) {
      return c.html(errorPage("ログインをやり直してください", EXPIRED_REQUEST_MESSAGE), 400);
    }

    const result = await login(
      deps,
      { username: form.username, password: form.password },
      requestEnvironment(c),
      form.rid,
    );
    if (!result.ok) {
      return c.redirect(withQuery("/login", { error: result.error.kind, rid: form.rid }), 303);
    }
    const next = result.value.kind === "totp_required" ? "/login/challenge" : "/login/mfa-setup";
    return c.redirect(withQuery(next, { mid: result.value.pendingId }), 303);
  });

  app.get("/api/login/challenge", async (c) => {
    return c.json({
      csrfToken: await issueCsrf(c),
      method: "totp",
      ...errorMessageOf(c),
    } satisfies LoginChallengeResponse);
  });

  app.post("/login/challenge", zValidator("form", codeFormSchema, invalidForm), async (c) => {
    const form = c.req.valid("form");
    const rejected = await rejectInvalidCsrf(c, deps, policy, form.csrf);
    if (rejected !== undefined) return rejected;
    const result = await completeTotpChallenge(deps, form.mid, form.code, requestEnvironment(c));
    if (!result.ok) return respondMfaError(c, result.error, "/login/challenge", form.mid);
    return finish(c, result.value.login, result.value.rid);
  });

  app.get("/api/login/mfa-setup", async (c) => {
    const setup = await beginTotpSetup(
      deps,
      c.req.query("mid") ?? "",
      c.req.query("renew") === "1",
    );
    if (!setup.ok) {
      return c.json({ error: "expired_request", message: EXPIRED_MFA_MESSAGE }, 400);
    }
    return c.json({
      csrfToken: await issueCsrf(c),
      method: "totp",
      account: setup.value.account,
      secret: setup.value.secret,
      otpauthUri: setup.value.otpauthUri,
      expiresAt: setup.value.expiresAt,
      ...errorMessageOf(c),
    } satisfies MfaSetupResponse);
  });

  app.post("/login/mfa-setup", zValidator("form", codeFormSchema, invalidForm), async (c) => {
    const form = c.req.valid("form");
    const rejected = await rejectInvalidCsrf(c, deps, policy, form.csrf);
    if (rejected !== undefined) return rejected;
    const result = await completeTotpSetup(deps, form.mid, form.code, requestEnvironment(c));
    if (!result.ok) return respondMfaError(c, result.error, "/login/mfa-setup", form.mid);
    return finish(c, result.value.login, result.value.rid);
  });

  return app;
}
