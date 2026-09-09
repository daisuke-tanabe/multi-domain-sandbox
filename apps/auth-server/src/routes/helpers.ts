import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  cookieName,
  sessionCookieAttributes,
  shortLivedCookieAttributes,
  type CookiePolicy,
} from "@sandbox/shared";
import { COOKIE_CSRF, COOKIE_SSO_SESSION, CSRF_TOKEN_TTL_SECONDS } from "../policy.ts";

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

export function noStore(c: Context): void {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
}
