import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  cookieName,
  sessionCookieAttributes,
  shortLivedCookieAttributes,
  type CookiePolicy,
} from "@sandbox/shared";
import type { Result } from "@sandbox/shared";
import { COOKIE_CSRF, COOKIE_SSO_SESSION, CSRF_TOKEN_TTL_SECONDS } from "../../../domain/policy.ts";
import type { AccessCheckError, IssuedCode } from "../../../application/usecases/authorize.ts";

export function ssoCookieName(policy: CookiePolicy): string {
  return cookieName(COOKIE_SSO_SESSION, "host", policy);
}

export function csrfCookieName(policy: CookiePolicy): string {
  return cookieName(COOKIE_CSRF, "host", policy);
}

export function readSsoCookie(c: Context, policy: CookiePolicy): string | undefined {
  return getCookie(c, ssoCookieName(policy));
}

export function writeSsoCookie(c: Context, policy: CookiePolicy, value: string): void {
  setCookie(c, ssoCookieName(policy), value, sessionCookieAttributes(policy));
}

export function clearSsoCookie(c: Context, policy: CookiePolicy): void {
  deleteCookie(c, ssoCookieName(policy), { path: "/", secure: policy.secure });
}

export function readCsrfCookie(c: Context, policy: CookiePolicy): string | undefined {
  return getCookie(c, csrfCookieName(policy));
}

export function writeCsrfCookie(c: Context, policy: CookiePolicy, value: string): void {
  setCookie(
    c,
    csrfCookieName(policy),
    value,
    shortLivedCookieAttributes(policy, "/", CSRF_TOKEN_TTL_SECONDS),
  );
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

export function noStore(c: Context): void {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
}
