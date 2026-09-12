import type { Context } from "hono";
import {
  clientIp,
  cookieAccessor,
  sessionCookieAttributes,
  shortLivedCookieAttributes,
  type CookieAccessor,
  type CookiePolicy,
  type Result,
} from "@sandbox/shared";
import { COOKIE_CSRF, COOKIE_SSO_SESSION, CSRF_TOKEN_TTL_SECONDS } from "../../../domain/policy.ts";
import type { RequestEnvironment } from "../../../domain/session.ts";
import type { AuthDeps } from "../../../application/deps.ts";
import type { AccessCheckError, IssuedCode } from "../../../application/usecases/authorize.ts";
import { verifyCsrfToken } from "../../../application/usecases/csrf.ts";
import { errorPage } from "../views/pages.ts";

export function ssoCookie(policy: CookiePolicy): CookieAccessor {
  return cookieAccessor(COOKIE_SSO_SESSION, "host", policy, sessionCookieAttributes(policy));
}

export function csrfCookie(policy: CookiePolicy): CookieAccessor {
  return cookieAccessor(
    COOKIE_CSRF,
    "host",
    policy,
    shortLivedCookieAttributes(policy, "/", CSRF_TOKEN_TTL_SECONDS),
  );
}

/**
 * フォーム POST の同期トークンを検証し、通らなければ 403 の HTML を返す。
 * ログイン、MFA、Global Logout、セッション失効のすべてのフォームで同じ
 */
export async function rejectInvalidCsrf(
  c: Context,
  deps: AuthDeps,
  policy: CookiePolicy,
  formToken: string,
): Promise<Response | undefined> {
  const valid = await verifyCsrfToken(deps, csrfCookie(policy).read(c), formToken);
  if (valid) return undefined;
  deps.logger.warn("csrf mismatch", { path: c.req.path });
  return c.html(
    errorPage("ページを再読み込みしてください", "フォームの有効期限が切れています。"),
    403,
  );
}

/** zValidator の失敗時。フォームは HTML、JSON の API は JSON で返す */
export function invalidForm(result: { success: boolean }, c: Context): Response | undefined {
  if (result.success) return undefined;
  return c.html(errorPage("無効なリクエストです", "入力内容が正しくありません。"), 400) as Response;
}

export function invalidJson(result: { success: boolean }, c: Context): Response | undefined {
  if (result.success) return undefined;
  return c.json({ error: "invalid_request" }, 400);
}

/** 空の値を落としてクエリを組む。SPA の画面へ戻すときに使う */
export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const encoded = query.toString();
  return encoded === "" ? path : `${path}?${encoded}`;
}

/**
 * 認可レスポンスのリダイレクト先を組み立てる。RFC 9207 に従い iss を含める。
 */
export function buildRedirect(
  redirectUri: string,
  issuer: string,
  params: Readonly<Record<string, string | undefined>>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  url.searchParams.set("iss", issuer);
  return url.toString();
}

/**
 * code 発行の結果を認可レスポンスのリダイレクト先にする。拒否理由は error_description で Client に伝える。
 */
export function redirectForOutcome(
  issuer: string,
  request: { readonly redirectUri: string; readonly state: string },
  outcome: Result<IssuedCode, AccessCheckError | { readonly kind: "invalid_request" }>,
): string {
  if (outcome.ok) {
    return buildRedirect(request.redirectUri, issuer, {
      code: outcome.value.code,
      state: request.state,
    });
  }
  return buildRedirect(request.redirectUri, issuer, {
    error: outcome.error.kind,
    ...(outcome.error.kind === "access_denied" && { error_description: outcome.error.reason }),
    state: request.state,
  });
}

/** ブラウザから届いた環境。監査とセッション記録に使う。Token 値は含めない */
export function requestEnvironment(c: Context): RequestEnvironment {
  return { ip: clientIp(c), userAgent: (c.req.header("user-agent") ?? "").slice(0, 512) };
}
