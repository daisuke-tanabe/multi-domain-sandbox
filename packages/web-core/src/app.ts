import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import {
  apiFetch,
  backchannelRoutes,
  oidcRoutes,
  tenantContext,
  type OidcClientDeps,
  type OidcEnv,
  type OidcProvider,
  type RenderError,
} from "@sandbox/oidc-client";
import type { SessionResponse } from "@sandbox/api-contract";
import {
  mountSpa,
  mountSpaAssets,
  spaCsp,
  timingSafeEqualString,
  type SpaOptions,
} from "@sandbox/shared";
import { errorPage, type PageLabels } from "./views/pages.ts";

export interface WebCoreAppOptions {
  readonly deps: OidcClientDeps;
  readonly provider: OidcProvider;
  readonly spa: SpaOptions;
}

const API_PREFIX = "/api/";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * サービスの Web の BFF。画面は SPA が描き、このサーバーは次だけを担う。
 *   /auth/*    OIDC のログイン、コールバック、ログアウト、Back-Channel Logout
 *   /session   SPA に渡すログイン状態と CSRF トークン。Token は渡さない
 *   /api/*     サービスの API への中継。サーバー側の Access Token を Bearer で付ける
 *   それ以外   SPA の配信
 * Token と Cookie はブラウザへ出さない。1 プロセス 1 サービス
 */
export function createWebCoreApp(options: WebCoreAppOptions): Hono<OidcEnv> {
  const { deps, provider, spa } = options;
  const app = new Hono<OidcEnv>();
  const csp = spaCsp(spa);

  const renderError: RenderError = (c, title, message, status) =>
    c.html(errorPage(hostLabels(c), title, message), status);

  app.use(
    secureHeaders({
      xFrameOptions: "DENY",
      referrerPolicy: "no-referrer",
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: [...csp.scriptSrc],
        connectSrc: [...csp.connectSrc],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
      },
    }),
  );
  // ログイン状態や役割を返す応答を bfcache や共有端末に残さない。静的アセットは mountSpa 側で上書きする
  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  // ALB のヘルスチェックはテナントのホストで来ないため、tenantContext の前に返す
  app.get("/healthz", (c) => c.json({ status: "ok" }));
  // 静的アセットはテナントの解決もセッションの読み込みも要らない
  mountSpaAssets(app, spa);
  // Back-Channel Logout はサーバー間通信で Host がテナントのホストにならないため、tenantContext の前に受ける
  app.route("/", backchannelRoutes(deps, provider));
  app.use(
    tenantContext(deps, (c) =>
      renderError(c, "不明なテナントです", "このホストは登録されていません。", 400),
    ),
  );
  app.route("/", oidcRoutes(deps, provider, renderError));

  app.get("/session", (c) => {
    const client = c.get("tenantClient");
    const session = c.get("tenantSession");
    const globalLogoutUrl = new URL("/logout", provider.issuer);
    globalLogoutUrl.searchParams.set("client_id", client.clientId);
    globalLogoutUrl.searchParams.set("tenant", client.tenantSlug);
    const base = {
      service: { clientId: client.clientId, name: client.name },
      tenant: { slug: client.tenantSlug },
      urls: {
        login: "/auth/login",
        logout: "/auth/logout",
        globalLogout: globalLogoutUrl.toString(),
      },
    };
    if (session === undefined) {
      return c.json({ ...base, authenticated: false } satisfies SessionResponse);
    }
    return c.json({
      ...base,
      authenticated: true,
      user: { id: session.userId, email: session.email, name: session.name },
      csrfToken: session.csrfToken,
    } satisfies SessionResponse);
  });

  // API への中継。ブラウザは Token を持たない。書き込みは CSRF トークンを要求する
  app.use("/api/*", bodyLimit({ maxSize: 64 * 1024 }));
  app.all("/api/*", async (c) => {
    const client = c.get("tenantClient");
    const session = c.get("tenantSession");
    if (session === undefined) return c.json({ error: "unauthenticated" }, 401);
    if (!SAFE_METHODS.has(c.req.method)) {
      const token = c.req.header("x-csrf-token");
      if (token === undefined || !timingSafeEqualString(token, session.csrfToken)) {
        return c.json({ error: "csrf_mismatch" }, 403);
      }
    }
    const upstreamPath = c.req.path.slice(API_PREFIX.length - 1);
    const url = new URL(upstreamPath + new URL(c.req.url).search, client.apiBaseUrl);
    const init: RequestInit = { method: c.req.method };
    // 本文は JSON だけ通す。DELETE のように本文のない書き込みは Content-Type なしで通す
    const requestType = c.req.header("content-type");
    if (!SAFE_METHODS.has(c.req.method) && requestType !== undefined) {
      if (!requestType.startsWith("application/json")) {
        return c.json({ error: "unsupported_media_type" }, 415);
      }
      init.headers = { "content-type": "application/json" };
      init.body = await c.req.text();
    }
    const result = await apiFetch(deps, provider, client, session, url.toString(), init);
    if (!result.ok) {
      if (result.error.kind === "session_expired") return c.json({ error: "unauthenticated" }, 401);
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
    // 本文はそのまま流す。API の Cache-Control などは引き継がず content-type だけ写す
    const upstream = result.value.response;
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType !== null) headers.set("content-type", contentType);
    return new Response(upstream.body, { status: upstream.status, headers });
  });

  mountSpa(app, spa);

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    deps.logger.error("unhandled error", { path: c.req.path, message: error.message });
    return c.json({ error: "server_error" }, 500);
  });

  return app;
}

/** tenantContext を通っていないエラー画面でも表示できるよう、未解決なら Host から補う */
function hostLabels(c: Context<OidcEnv>): PageLabels {
  const client = c.get("tenantClient");
  if (client !== undefined) return { serviceName: client.name, tenantSlug: client.tenantSlug };
  const host = c.req.header("host") ?? "";
  return { serviceName: "Sandbox", tenantSlug: host.split(".")[0] ?? "unknown" };
}
