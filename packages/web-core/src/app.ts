import { Hono, type Context } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import {
  apiFetch,
  backchannelRoutes,
  oidcRoutes,
  requireSession,
  tenantContext,
  type OidcClientDeps,
  type OidcEnv,
  type OidcProvider,
  type RenderError,
  type TenantSession,
} from "@sandbox/oidc-client";
import { timingSafeEqualString } from "@sandbox/shared";
import { dashboardPage, errorPage, homePage, type PageLabels, type Viewer } from "./views/pages.ts";

export interface WebCoreAppOptions {
  readonly deps: OidcClientDeps;
  readonly provider: OidcProvider;
}

const meSchema = z.object({
  role: z.string(),
  permissions: z.array(z.string()),
  service: z.object({ roles: z.array(z.string()), permissions: z.array(z.string()) }),
});

function toViewer(session: TenantSession): Viewer {
  return { name: session.name, email: session.email, csrfToken: session.csrfToken };
}

/**
 * サービスの Web。BFF として API をサーバー間で呼び、ブラウザには HTML と Cookie だけを返す。1 プロセス 1 サービス
 */
export function createWebCoreApp(options: WebCoreAppOptions): Hono<OidcEnv> {
  const { deps, provider } = options;
  const app = new Hono<OidcEnv>();

  const renderError: RenderError = (c, title, message, status) =>
    c.html(errorPage(hostLabels(c), title, message), status);

  app.use(
    secureHeaders({
      xFrameOptions: "DENY",
      referrerPolicy: "no-referrer",
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    }),
  );
  // ログイン済みページには CSRF トークンや役割が載る。bfcache や共有端末に残さない
  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  // ALB のヘルスチェックはテナントのホストで来ないため、tenantContext の前に返す
  app.get("/healthz", (c) => c.json({ status: "ok" }));
  // Back-Channel Logout はサーバー間通信で Host がテナントのホストにならないため、tenantContext の前に受ける
  app.route("/", backchannelRoutes(deps, provider));
  app.use(
    tenantContext(deps, (c) =>
      renderError(c, "不明なテナントです", "このホストは登録されていません。", 400),
    ),
  );
  app.route("/", oidcRoutes(deps, provider, renderError));

  app.get("/", (c) => {
    const session = c.get("tenantSession");
    const client = c.get("tenantClient");
    const globalLogoutUrl = new URL("/logout", provider.issuer);
    globalLogoutUrl.searchParams.set("client_id", client.clientId);
    globalLogoutUrl.searchParams.set("tenant", client.tenantSlug);
    return c.html(
      homePage({
        serviceName: client.name,
        tenantSlug: client.tenantSlug,
        viewer: session === undefined ? undefined : toViewer(session),
        justLoggedOut: c.req.query("logged_out") === "1",
        globalLogoutUrl: globalLogoutUrl.toString(),
      }),
    );
  });

  // このサービスでの役割と権限を API から取って出す。画面の本体は React 化で置き換える
  app.get("/dashboard", requireSession(), async (c) => {
    const session = c.get("tenantSession");
    if (session === undefined) return c.redirect("/auth/login");
    const client = c.get("tenantClient");
    const me = await apiFetch(deps, provider, client, session, `${client.apiBaseUrl}/v1/me`);
    if (!me.ok) return handleApiAccessError(c, me.error.kind);
    if (me.value.response.status === 403) {
      return renderError(
        c,
        "アクセス権がありません",
        "このテナントへのアクセス権がありません。",
        403,
      );
    }
    const body = meSchema.safeParse(await me.value.response.json());
    if (!body.success)
      return renderError(c, "一時的なエラーです", "API 応答を解釈できません。", 503);
    return c.html(
      dashboardPage({
        serviceName: client.name,
        tenantSlug: client.tenantSlug,
        viewer: toViewer(session),
        role: body.data.role,
        permissions: body.data.permissions,
        availablePermissions: body.data.service.permissions,
      }),
    );
  });

  function handleApiAccessError(
    c: Context<OidcEnv>,
    kind: "session_expired" | "provider_unavailable",
  ): Response | Promise<Response> {
    if (kind === "session_expired") {
      // Refresh が拒否された。SSO Session が生きていれば /auth/login で無画面復帰する
      return c.redirect(`/auth/login?return_to=${encodeURIComponent(c.req.path)}`);
    }
    return renderError(c, "一時的なエラーです", "認証サーバーに接続できません。", 503);
  }

  app.notFound((c) =>
    c.html(
      errorPage(hostLabels(c), "ページが見つかりません", "指定されたページは存在しません。"),
      404,
    ),
  );
  app.onError((error, c) => {
    deps.logger.error("unhandled error", { path: c.req.path, message: error.message });
    return c.html(
      errorPage(hostLabels(c), "一時的なエラーです", "しばらくしてから再試行してください。"),
      500,
    );
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
