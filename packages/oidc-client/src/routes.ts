import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  computeCodeChallenge,
  cookieName,
  generateCodeVerifier,
  randomToken,
  sanitizeReturnTo,
  sessionCookieAttributes,
  shortLivedCookieAttributes,
} from "@sandbox/shared";
import type { OidcProvider } from "./provider.ts";
import { createSession, destroySession, destroySessionsBySid, loadSession } from "./session.ts";
import {
  COOKIE_PRE_AUTH,
  COOKIE_SESSION,
  PRE_AUTH_TTL_SECONDS,
  type OidcClientConfig,
  type OidcClientDeps,
} from "./types.ts";

export interface OidcRouteHooks {
  /** アクセス権なし等のエラー画面。Tenant 側の見た目に合わせるため注入する */
  readonly renderError: (
    c: Context,
    title: string,
    message: string,
    status: 400 | 401 | 403 | 500 | 503,
  ) => Response | Promise<Response>;
}

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

export function clearSessionCookie(c: Context, deps: OidcClientDeps): void {
  deleteCookie(c, sessionCookieName(deps), { path: "/", secure: deps.cookiePolicy.secure });
}

function preAuthKey(client: OidcClientConfig, id: string): string {
  return `${client.tenantSlug}:${id}`;
}

/**
 * /auth/login, /auth/callback, /auth/logout。docs/design/06-oidc-client-design.md に対応する。
 */
export function oidcRoutes(
  deps: OidcClientDeps,
  provider: OidcProvider,
  hooks: OidcRouteHooks,
): Hono {
  const app = new Hono();

  app.get("/auth/login", async (c) => {
    const client = deps.resolveClient(c.req.header("host"));
    if (client === undefined)
      return hooks.renderError(c, "不明なテナントです", "このホストは登録されていません。", 400);

    const discovery = await provider.getDiscovery();
    if (!discovery.ok) {
      deps.logger.error("discovery failed", { reason: discovery.error.kind });
      return hooks.renderError(
        c,
        "一時的なエラーです",
        "しばらくしてから再試行してください。",
        503,
      );
    }

    const codeVerifier = generateCodeVerifier();
    const preAuth = {
      id: randomToken(),
      tenantSlug: client.tenantSlug,
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier,
      returnTo: sanitizeReturnTo(c.req.query("return_to")),
      createdAt: deps.clock.nowSeconds(),
    };
    await deps.preAuth.set(preAuthKey(client, preAuth.id), preAuth, PRE_AUTH_TTL_SECONDS);
    setCookie(
      c,
      preAuthCookieName(deps),
      preAuth.id,
      shortLivedCookieAttributes(deps.cookiePolicy, PRE_AUTH_PATH, PRE_AUTH_TTL_SECONDS),
    );

    const url = new URL(discovery.value.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", client.clientId);
    url.searchParams.set("redirect_uri", client.redirectUri);
    url.searchParams.set("scope", client.scopes.join(" "));
    url.searchParams.set("state", preAuth.state);
    url.searchParams.set("nonce", preAuth.nonce);
    url.searchParams.set("code_challenge", computeCodeChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    c.header("Cache-Control", "no-store");
    return c.redirect(url.toString());
  });

  app.get("/auth/callback", async (c) => {
    c.header("Cache-Control", "no-store");
    const client = deps.resolveClient(c.req.header("host"));
    if (client === undefined)
      return hooks.renderError(c, "不明なテナントです", "このホストは登録されていません。", 400);

    const preAuthId = getCookie(c, preAuthCookieName(deps));
    const preAuth =
      preAuthId === undefined ? undefined : await deps.preAuth.get(preAuthKey(client, preAuthId));
    deleteCookie(c, preAuthCookieName(deps), {
      path: PRE_AUTH_PATH,
      secure: deps.cookiePolicy.secure,
    });
    if (preAuthId === undefined || preAuth === undefined) {
      return hooks.renderError(
        c,
        "ログインをやり直してください",
        "ログイン要求の有効期限が切れています。",
        400,
      );
    }
    await deps.preAuth.delete(preAuthKey(client, preAuthId));

    // state は code の有無に関わらず最初に検証する。CSRF とレスポンス差し替えを防ぐ
    if (c.req.query("state") !== preAuth.state) {
      deps.logger.warn("state mismatch on callback", { tenantSlug: client.tenantSlug });
      return hooks.renderError(
        c,
        "ログインをやり直してください",
        "ログイン要求が一致しません。",
        400,
      );
    }
    const issParam = c.req.query("iss");
    if (issParam !== undefined && issParam !== provider.issuer) {
      deps.logger.warn("iss mismatch on callback", { tenantSlug: client.tenantSlug });
      return hooks.renderError(
        c,
        "ログインをやり直してください",
        "ログイン要求が一致しません。",
        400,
      );
    }

    const errorParam = c.req.query("error");
    if (errorParam !== undefined) return renderAuthorizationError(c, hooks, errorParam);

    const code = c.req.query("code");
    if (code === undefined || code === "") {
      return hooks.renderError(c, "ログインをやり直してください", "認可コードがありません。", 400);
    }

    const tokens = await provider.exchangeCode(client, code, preAuth.codeVerifier);
    if (!tokens.ok) return renderTokenError(c, deps, hooks, tokens.error.kind);
    if (tokens.value.id_token === undefined) {
      return hooks.renderError(c, "ログインをやり直してください", "ID Token がありません。", 401);
    }

    const claims = await provider.verifyIdToken(tokens.value.id_token, client, preAuth.nonce);
    if (!claims.ok) {
      deps.logger.warn("id token verification failed", {
        tenantSlug: client.tenantSlug,
        reason: claims.error.kind,
      });
      return hooks.renderError(
        c,
        "ログインをやり直してください",
        "認証結果を検証できませんでした。",
        401,
      );
    }
    const payload = claims.value;
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      return hooks.renderError(c, "ログインをやり直してください", "認証結果が不完全です。", 401);
    }

    // セッション固定攻撃対策。既存セッションは破棄して新しい ID を発行する
    const existing = await loadSession(deps, client.tenantSlug, readSessionCookie(c, deps));
    if (existing !== undefined) await destroySession(deps, existing);

    const session = await createSession(deps, {
      tenantSlug: client.tenantSlug,
      userId: payload.sub,
      tenantId: typeof payload.tenant_id === "string" ? payload.tenant_id : null,
      sid: payload.sid,
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
      tokens: tokens.value,
    });
    setCookie(c, sessionCookieName(deps), session.id, sessionCookieAttributes(deps.cookiePolicy));
    deps.logger.info("tenant session created", {
      tenantSlug: client.tenantSlug,
      userId: session.userId,
    });
    return c.redirect(preAuth.returnTo);
  });

  app.post("/auth/logout", async (c) => {
    c.header("Cache-Control", "no-store");
    const client = deps.resolveClient(c.req.header("host"));
    if (client === undefined)
      return hooks.renderError(c, "不明なテナントです", "このホストは登録されていません。", 400);

    const session = await loadSession(deps, client.tenantSlug, readSessionCookie(c, deps));
    if (session === undefined) {
      clearSessionCookie(c, deps);
      return c.redirect("/");
    }
    const form = await c.req.parseBody();
    if (form.csrf !== session.csrfToken) {
      deps.logger.warn("logout csrf mismatch", { tenantSlug: client.tenantSlug });
      return hooks.renderError(
        c,
        "ページを再読み込みしてください",
        "フォームの有効期限が切れています。",
        403,
      );
    }

    const revoked = await provider.revoke(client, session.refreshToken);
    if (!revoked.ok)
      deps.logger.warn("revoke failed", {
        tenantSlug: client.tenantSlug,
        reason: revoked.error.kind,
      });
    await destroySession(deps, session);
    clearSessionCookie(c, deps);
    deps.logger.info("tenant session destroyed", {
      tenantSlug: client.tenantSlug,
      userId: session.userId,
    });
    return c.redirect("/?logged_out=1");
  });

  /**
   * OIDC Back-Channel Logout。Auth Server からのサーバー間 POST。Host ヘッダに依存せず aud で Client を決める。
   */
  app.post("/auth/backchannel-logout", async (c) => {
    c.header("Cache-Control", "no-store");
    const form = await c.req.parseBody();
    const logoutToken = form.logout_token;
    if (typeof logoutToken !== "string" || logoutToken === "") {
      return c.json({ error: "invalid_request" }, 400);
    }
    const verified = await provider.verifyLogoutToken(logoutToken);
    if (!verified.ok) {
      deps.logger.warn("logout token rejected", { reason: verified.error.kind });
      return c.json({ error: "invalid_request" }, 400);
    }
    const client = deps.resolveClientById(verified.value.audience);
    if (client === undefined) return c.json({ error: "invalid_request" }, 400);

    const removed = await destroySessionsBySid(deps, client.tenantSlug, verified.value.sid);
    deps.logger.info("backchannel logout applied", { tenantSlug: client.tenantSlug, removed });
    return c.body(null, 200);
  });

  return app;
}

function renderAuthorizationError(
  c: Context,
  hooks: OidcRouteHooks,
  errorParam: string,
): Response | Promise<Response> {
  if (errorParam === "access_denied") {
    return hooks.renderError(
      c,
      "アクセス権がありません",
      "このテナントへのアクセス権がありません。管理者に招待を依頼してください。",
      403,
    );
  }
  return hooks.renderError(c, "ログインに失敗しました", "サービスからやり直してください。", 400);
}

function renderTokenError(
  c: Context,
  deps: OidcClientDeps,
  hooks: OidcRouteHooks,
  kind: string,
): Response | Promise<Response> {
  switch (kind) {
    case "invalid_grant":
      return hooks.renderError(c, "ログインをやり直してください", "認可コードが無効です。", 401);
    case "invalid_client":
      deps.logger.error("client authentication failed. check client secret configuration");
      return hooks.renderError(
        c,
        "一時的なエラーです",
        "しばらくしてから再試行してください。",
        500,
      );
    default:
      deps.logger.error("token request failed", { reason: kind });
      return hooks.renderError(
        c,
        "一時的なエラーです",
        "しばらくしてから再試行してください。",
        503,
      );
  }
}
