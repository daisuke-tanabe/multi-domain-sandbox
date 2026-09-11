import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cookieName, sessionCookieAttributes, shortLivedCookieAttributes } from "@sandbox/shared";
import {
  COOKIE_PRE_AUTH,
  COOKIE_SESSION,
  PRE_AUTH_TTL_SECONDS,
  type OidcClientDeps,
} from "./types.ts";

const PRE_AUTH_PATH = "/auth";

function sessionCookieName(deps: OidcClientDeps): string {
  return cookieName(COOKIE_SESSION, "host", deps.cookiePolicy);
}

function preAuthCookieName(deps: OidcClientDeps): string {
  return cookieName(COOKIE_PRE_AUTH, "path", deps.cookiePolicy);
}

export function readSessionCookie(c: Context, deps: OidcClientDeps): string | undefined {
  return getCookie(c, sessionCookieName(deps));
}

export function writeSessionCookie(c: Context, deps: OidcClientDeps, sessionId: string): void {
  setCookie(c, sessionCookieName(deps), sessionId, sessionCookieAttributes(deps.cookiePolicy));
}

export function clearSessionCookie(c: Context, deps: OidcClientDeps): void {
  deleteCookie(c, sessionCookieName(deps), { path: "/", secure: deps.cookiePolicy.secure });
}

export function readPreAuthCookie(c: Context, deps: OidcClientDeps): string | undefined {
  return getCookie(c, preAuthCookieName(deps));
}

export function writePreAuthCookie(c: Context, deps: OidcClientDeps, preAuthId: string): void {
  setCookie(
    c,
    preAuthCookieName(deps),
    preAuthId,
    shortLivedCookieAttributes(deps.cookiePolicy, PRE_AUTH_PATH, PRE_AUTH_TTL_SECONDS),
  );
}

export function clearPreAuthCookie(c: Context, deps: OidcClientDeps): void {
  deleteCookie(c, preAuthCookieName(deps), {
    path: PRE_AUTH_PATH,
    secure: deps.cookiePolicy.secure,
  });
}
