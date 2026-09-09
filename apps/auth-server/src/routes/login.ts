import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { CookiePolicy } from "@sandbox/shared";
import type { AuthorizationRequest } from "../ports/stores.ts";
import { validateAuthorizationRequest } from "../usecases/authorization-request.ts";
import { authorizeWithSession } from "../usecases/authorize.ts";
import { issueCsrfToken, verifyCsrfToken } from "../usecases/csrf.ts";
import type { AuthDeps } from "../usecases/deps.ts";
import { login, type LoginError } from "../usecases/login.ts";
import { loadSsoSession } from "../usecases/sso-session.ts";
import { errorPage, loginPage } from "../views/pages.ts";
import {
  buildRedirect,
  noStore,
  readCsrfCookie,
  readSsoCookie,
  writeCsrfCookie,
  writeSsoCookie,
} from "./helpers.ts";

const loginFormSchema = z.object({
  rid: z.string().default(""),
  csrf: z.string().min(1),
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
});

const GENERIC_FAILURE = "ユーザー名またはパスワードが正しくありません";
const EXPIRED_REQUEST_MESSAGE =
  "ログイン画面を開いてから時間が経ちすぎたか、認証サーバーが再起動しました。利用したいサービスの URL をブラウザで開き直してログインしてください。";

/**
 * 失敗理由をユーザー向け文言に写像する。ユーザー列挙を防ぐため認証失敗系は同一文言にする。
 */
function loginErrorMessage(error: LoginError): string {
  switch (error.kind) {
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
      return exhaustive(error);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled login error: ${String(value)}`);
}

export function loginRoutes(deps: AuthDeps, policy: CookiePolicy): Hono {
  const app = new Hono();

  app.get("/login", async (c) => {
    noStore(c);
    const rid = c.req.query("rid") ?? "";
    if (rid !== "") {
      const request = await deps.stores.authorizationRequests.get(rid);
      if (request === undefined) {
        return c.html(errorPage("ログインをやり直してください", EXPIRED_REQUEST_MESSAGE), 400);
      }
    } else {
      // rid なしはポータル用ログイン。既に SSO Session があればポータルへ
      const session = await loadSsoSession(deps, readSsoCookie(c, policy));
      if (session !== undefined) return c.redirect("/");
    }
    const csrf = await issueCsrfToken(deps);
    writeCsrfCookie(c, policy, csrf.cookieValue);
    return c.html(loginPage({ rid, csrfToken: csrf.formToken }));
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

      const request =
        form.rid === "" ? undefined : await deps.stores.authorizationRequests.get(form.rid);
      if (form.rid !== "" && request === undefined) {
        return c.html(errorPage("ログインをやり直してください", EXPIRED_REQUEST_MESSAGE), 400);
      }

      const result = await login(deps, { username: form.username, password: form.password });
      if (!result.ok) {
        const csrf = await issueCsrfToken(deps);
        writeCsrfCookie(c, policy, csrf.cookieValue);
        return c.html(
          loginPage({
            rid: form.rid,
            csrfToken: csrf.formToken,
            errorMessage: loginErrorMessage(result.error),
            username: form.username,
          }),
          200,
        );
      }

      writeSsoCookie(c, policy, result.value.session.id);
      if (request === undefined) return c.redirect("/");
      await deps.stores.authorizationRequests.delete(form.rid);
      return c.redirect(await completeAuthorization(deps, request, result.value.session.id));
    },
  );

  return app;
}

/**
 * ログイン成功後、保存しておいた認可リクエストに対して code を発行する。
 */
async function completeAuthorization(
  deps: AuthDeps,
  request: AuthorizationRequest,
  sessionId: string,
): Promise<string> {
  const validated = await validateAuthorizationRequest(deps.identity, {
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: "code",
    scope: request.scope,
    state: request.state,
    nonce: request.nonce,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
  });
  if (!validated.ok) {
    // ログイン中に Client が無効化された場合。redirect_uri は保存時点で検証済みなので戻してよい
    return buildRedirect(request.redirectUri, deps.issuer, {
      error: "invalid_request",
      state: request.state,
    });
  }
  const session = await deps.stores.ssoSessions.get(sessionId);
  if (session === undefined) {
    return buildRedirect(request.redirectUri, deps.issuer, {
      error: "server_error",
      state: request.state,
    });
  }
  const outcome = await authorizeWithSession(deps, validated.value, session);
  if (!outcome.ok) {
    return buildRedirect(request.redirectUri, deps.issuer, {
      error: "access_denied",
      state: request.state,
    });
  }
  return buildRedirect(outcome.value.redirectUri, deps.issuer, {
    code: outcome.value.code,
    state: outcome.value.state,
  });
}
