import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { LoginContextResponse, LoginRedirectResponse } from "@sandbox/api-contract";
import type { CookiePolicy } from "@sandbox/shared";
import { issueCsrfToken, verifyCsrfToken } from "../../../application/usecases/csrf.ts";
import type { AuthDeps } from "../../../application/deps.ts";
import { login, type LoginError } from "../../../application/usecases/login.ts";
import {
  deletePendingAuthorization,
  loadPendingAuthorization,
  resumePendingAuthorization,
} from "../../../application/usecases/pending-authorization.ts";
import { destroySsoSession, loadSsoSession } from "../../../application/usecases/sso-session.ts";
import { errorPage } from "../views/pages.ts";
import {
  noStore,
  redirectForOutcome,
  readCsrfCookie,
  readSsoCookie,
  requestEnvironment,
  writeCsrfCookie,
  writeSsoCookie,
} from "./helpers.ts";

const loginFormSchema = z.object({
  rid: z.string().default(""),
  csrf: z.string().min(1),
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
});

const LOGIN_ERROR_KINDS = [
  "invalid_credentials",
  "user_disabled",
  "user_not_confirmed",
  "password_reset_required",
  "challenge_required",
  "unavailable",
] as const satisfies ReadonlyArray<LoginError["kind"]>;

const GENERIC_FAILURE = "ユーザー名またはパスワードが正しくありません";
const EXPIRED_REQUEST_MESSAGE =
  "ログイン画面を開いてから時間が経ちすぎたか、認証サーバーが再起動しました。利用したいサービスの URL をブラウザで開き直してログインしてください。";

/**
 * 失敗理由をユーザー向け文言に写像する。ユーザー列挙を防ぐため認証失敗系は同一文言にする。
 */
function loginErrorMessage(kind: LoginError["kind"]): string {
  switch (kind) {
    case "invalid_credentials":
    case "user_disabled":
      return GENERIC_FAILURE;
    case "user_not_confirmed":
      return "アカウントが確認されていません";
    case "password_reset_required":
      return "パスワードの再設定が必要です";
    case "challenge_required":
      return "この認証方式は現在未対応です";
    case "unavailable":
      return "一時的なエラーです。しばらくしてから再試行してください";
    default:
      return exhaustive(kind);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled login error: ${String(value)}`);
}

function isLoginErrorKind(value: string): value is LoginError["kind"] {
  return (LOGIN_ERROR_KINDS as ReadonlyArray<string>).includes(value);
}

/** 失敗したら種類だけをクエリに載せて SPA のログイン画面へ戻す。文言は /api/login が返す */
function loginRetryPath(rid: string, kind: LoginError["kind"]): string {
  const params = new URLSearchParams({ error: kind });
  if (rid !== "") params.set("rid", rid);
  return `/login?${params.toString()}`;
}

/**
 * ログイン。画面は apps/auth-web の SPA が描く。
 *   GET  /api/login  SPA がフォームを描くための rid、CSRF、エラー文言
 *   POST /login      フォーム POST。成功は /authorize の続きへ、失敗は /login?error= へ戻す
 */
export function loginRoutes(deps: AuthDeps, policy: CookiePolicy): Hono {
  const app = new Hono();

  app.get("/api/login", async (c) => {
    noStore(c);
    const rid = c.req.query("rid") ?? "";
    if (rid !== "") {
      const request = await loadPendingAuthorization(deps, rid);
      if (request === undefined) {
        return c.json({ error: "expired_request", message: EXPIRED_REQUEST_MESSAGE }, 400);
      }
    } else {
      // rid なしはポータル用ログイン。既に SSO Session があればポータルへ
      const session = await loadSsoSession(deps, readSsoCookie(c, policy));
      if (session !== undefined) return c.json({ redirectTo: "/" } satisfies LoginRedirectResponse);
    }
    const csrf = await issueCsrfToken(deps);
    writeCsrfCookie(c, policy, csrf.cookieValue);
    const errorKind = c.req.query("error") ?? "";
    return c.json({
      rid,
      csrfToken: csrf.formToken,
      ...(isLoginErrorKind(errorKind) && { errorMessage: loginErrorMessage(errorKind) }),
    } satisfies LoginContextResponse);
  });

  app.post(
    "/login",
    zValidator("form", loginFormSchema, (result, c) => {
      if (!result.success)
        return c.html(errorPage("無効なリクエストです", "入力内容が正しくありません。"), 400);
      return undefined;
    }),
    async (c) => {
      noStore(c);
      const form = c.req.valid("form");

      const csrfValid = await verifyCsrfToken(deps, readCsrfCookie(c, policy), form.csrf);
      if (!csrfValid) {
        deps.logger.warn("login csrf mismatch");
        return c.html(
          errorPage("ページを再読み込みしてください", "フォームの有効期限が切れています。"),
          403,
        );
      }

      const request = form.rid === "" ? undefined : await loadPendingAuthorization(deps, form.rid);
      if (form.rid !== "" && request === undefined) {
        return c.html(errorPage("ログインをやり直してください", EXPIRED_REQUEST_MESSAGE), 400);
      }

      const environment = requestEnvironment(c);
      const result = await login(
        deps,
        { username: form.username, password: form.password },
        environment,
      );
      if (!result.ok) return c.redirect(loginRetryPath(form.rid, result.error.kind), 303);

      // 古い SSO Session を残さない。Cookie を上書きするだけでは前のセッションが期限まで生き続ける
      const previous = await loadSsoSession(deps, readSsoCookie(c, policy));
      if (previous !== undefined) await destroySsoSession(deps, previous);
      writeSsoCookie(c, policy, result.value.cookieValue);
      if (request === undefined) return c.redirect("/", 303);
      await deletePendingAuthorization(deps, form.rid);
      const outcome = await resumePendingAuthorization(
        deps,
        request,
        result.value.session,
        environment,
      );
      return c.redirect(redirectForOutcome(deps.issuer, request, outcome), 303);
    },
  );

  return app;
}
