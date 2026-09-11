import { Hono, type Context } from "hono";
import {
  computeCodeChallenge,
  generateCodeVerifier,
  isAccessDeniedReason,
  randomToken,
  sanitizeReturnTo,
  type AccessDeniedReason,
} from "@sandbox/shared";
import {
  clearPreAuthCookie,
  clearSessionCookie,
  readPreAuthCookie,
  readSessionCookie,
  writePreAuthCookie,
  writeSessionCookie,
} from "./cookies.ts";
import type { OidcEnv } from "./middleware.ts";
import type { OidcProvider, ProviderError } from "./provider.ts";
import { createSession, destroySession, destroySessionsBySid, loadSession } from "./session.ts";
import { PRE_AUTH_TTL_SECONDS, type OidcClientConfig, type OidcClientDeps } from "./types.ts";

export type ErrorStatus = 400 | 401 | 403 | 500 | 503;

/** アクセス権なし等のエラー画面。サービス側の見た目に合わせるため注入する */
export type RenderError = (
  c: Context,
  title: string,
  message: string,
  status: ErrorStatus,
) => Response | Promise<Response>;

function preAuthKey(client: OidcClientConfig, id: string): string {
  return `${client.tenantSlug}:${id}`;
}

/**
 * /auth/login, /auth/callback, /auth/logout。docs/design/06-oidc-client-design.md に対応する。
 * tenantContext の後に mount し、Client は c.get("tenantClient") から受け取る。
 */
export function oidcRoutes(
  deps: OidcClientDeps,
  provider: OidcProvider,
  renderError: RenderError,
): Hono<OidcEnv> {
  const app = new Hono<OidcEnv>();
  const retryLogin = (c: Context, message: string, status: 400 | 401 = 400) =>
    renderError(c, "ログインをやり直してください", message, status);
  const temporaryError = (c: Context, status: 500 | 503 = 503) =>
    renderError(c, "一時的なエラーです", "しばらくしてから再試行してください。", status);

  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/auth/login", async (c) => {
    const client = c.get("tenantClient");
    const discovery = await provider.getDiscovery();
    if (!discovery.ok) {
      deps.logger.error("discovery failed", { reason: discovery.error.kind });
      return temporaryError(c);
    }

    const preAuthId = randomToken();
    const codeVerifier = generateCodeVerifier();
    const preAuth = {
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier,
      returnTo: sanitizeReturnTo(c.req.query("return_to")),
    };
    await deps.preAuth.set(preAuthKey(client, preAuthId), preAuth, PRE_AUTH_TTL_SECONDS);
    writePreAuthCookie(c, deps, preAuthId);

    const url = new URL(discovery.value.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", client.clientId);
    url.searchParams.set("redirect_uri", client.redirectUri);
    url.searchParams.set("scope", client.scopes.join(" "));
    url.searchParams.set("state", preAuth.state);
    url.searchParams.set("nonce", preAuth.nonce);
    url.searchParams.set("code_challenge", computeCodeChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    return c.redirect(url.toString());
  });

  app.get("/auth/callback", async (c) => {
    const client = c.get("tenantClient");
    const preAuthId = readPreAuthCookie(c, deps);
    // 一回限り。取得と同時に消す
    const preAuth =
      preAuthId === undefined
        ? undefined
        : await deps.preAuth.getAndDelete(preAuthKey(client, preAuthId));
    clearPreAuthCookie(c, deps);
    if (preAuth === undefined) return retryLogin(c, "ログイン要求の有効期限が切れています。");

    // state は code の有無に関わらず最初に検証する。CSRF とレスポンス差し替えを防ぐ
    if (c.req.query("state") !== preAuth.state) {
      deps.logger.warn("state mismatch on callback", { tenantSlug: client.tenantSlug });
      return retryLogin(c, "ログイン要求が一致しません。");
    }
    const issParam = c.req.query("iss");
    if (issParam !== undefined && issParam !== provider.issuer) {
      deps.logger.warn("iss mismatch on callback", { tenantSlug: client.tenantSlug });
      return retryLogin(c, "ログイン要求が一致しません。");
    }

    const errorParam = c.req.query("error");
    if (errorParam !== undefined) {
      return renderAuthorizationError(
        c,
        renderError,
        client,
        errorParam,
        c.req.query("error_description"),
      );
    }

    const code = c.req.query("code");
    if (code === undefined || code === "") return retryLogin(c, "認可コードがありません。");

    const tokens = await provider.exchangeCode(client, code, preAuth.codeVerifier);
    if (!tokens.ok) return renderTokenError(c, tokens.error);
    if (tokens.value.id_token === undefined) return retryLogin(c, "ID Token がありません。", 401);

    const claims = await provider.verifyIdToken(tokens.value.id_token, client, preAuth.nonce);
    if (!claims.ok) {
      deps.logger.warn("id token verification failed", {
        tenantSlug: client.tenantSlug,
        reason: claims.error.kind,
      });
      return retryLogin(c, "認証結果を検証できませんでした。", 401);
    }
    const payload = claims.value;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.tenant_id !== "string"
    ) {
      return retryLogin(c, "認証結果が不完全です。", 401);
    }
    // 発行されたテナントがこのホストのテナントと一致することを確かめる。code は redirect_uri に紐付くが二重に見る
    if (payload.tenant_slug !== client.tenantSlug) {
      deps.logger.warn("tenant mismatch on callback", {
        clientId: client.clientId,
        tenantSlug: client.tenantSlug,
      });
      return retryLogin(c, "テナントが一致しません。", 401);
    }

    // セッション固定攻撃対策。既存セッションは破棄して新しい ID を発行する
    const existing = await loadSession(deps, client, readSessionCookie(c, deps));
    if (existing !== undefined) await destroySession(deps, existing);

    const session = await createSession(deps, {
      client,
      userId: payload.sub,
      tenantId: payload.tenant_id,
      sid: payload.sid,
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
      tokens: tokens.value,
    });
    writeSessionCookie(c, deps, session.id);
    deps.logger.info("tenant session created", {
      tenantSlug: client.tenantSlug,
      userId: session.userId,
    });
    return c.redirect(preAuth.returnTo);
  });

  app.post("/auth/logout", async (c) => {
    const client = c.get("tenantClient");
    const session = c.get("tenantSession");
    if (session === undefined) {
      clearSessionCookie(c, deps);
      return c.redirect("/");
    }
    const form = await c.req.parseBody();
    if (form.csrf !== session.csrfToken) {
      deps.logger.warn("logout csrf mismatch", { tenantSlug: client.tenantSlug });
      return renderError(
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

  function renderTokenError(c: Context, error: ProviderError): Response | Promise<Response> {
    switch (error.kind) {
      case "invalid_grant":
        return retryLogin(c, "認可コードが無効です。", 401);
      case "invalid_client":
        deps.logger.error("client authentication failed. check client secret configuration");
        return temporaryError(c, 500);
      default:
        deps.logger.error("token request failed", { reason: error.kind });
        return temporaryError(c);
    }
  }

  return app;
}

/**
 * OIDC Back-Channel Logout。Auth Server からのサーバー間 POST。
 * Host ヘッダに依存せず aud で Client を決めるため、tenantContext の前に mount する。
 */
export function backchannelRoutes(deps: OidcClientDeps, provider: OidcProvider): Hono {
  const app = new Hono();

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

    const removed = await destroySessionsBySid(deps, verified.value.sid);
    deps.logger.info("backchannel logout applied", { clientId: client.clientId, removed });
    return c.body(null, 200);
  });

  return app;
}

function renderAuthorizationError(
  c: Context,
  renderError: RenderError,
  client: OidcClientConfig,
  errorParam: string,
  description: string | undefined,
): Response | Promise<Response> {
  if (errorParam !== "access_denied") {
    return renderError(c, "ログインに失敗しました", "サービスからやり直してください。", 400);
  }
  const reason: AccessDeniedReason | undefined = isAccessDeniedReason(description)
    ? description
    : undefined;
  switch (reason) {
    case "not_contracted":
      return renderError(
        c,
        "このサービスは契約されていません",
        `テナント ${client.tenantSlug} は ${client.name} を契約していません。契約状況を確認してください。`,
        403,
      );
    case "tenant_suspended":
      return renderError(c, "テナントは利用停止中です", "管理者に確認してください。", 403);
    default:
      return renderError(
        c,
        "アクセス権がありません",
        `テナント ${client.tenantSlug} へのアクセス権がありません。管理者に招待を依頼してください。`,
        403,
      );
  }
}
