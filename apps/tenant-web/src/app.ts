import { Hono, type Context } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import {
  apiFetch,
  oidcRoutes,
  requireSession,
  tenantContext,
  type OidcClientDeps,
  type OidcEnv,
  type OidcProvider,
  type TenantSession,
} from "@sandbox/oidc-client";
import { errorPage, homePage, projectsPage, type Viewer } from "./views/pages.ts";

export interface TenantAppOptions {
  readonly deps: OidcClientDeps;
  readonly provider: OidcProvider;
  /** サーバー間通信用の API ベース URL */
  readonly apiBaseUrl: string;
}

const meSchema = z.object({
  user: z.object({ id: z.string(), email: z.string() }),
  tenant: z.object({ id: z.string(), slug: z.string() }),
  role: z.string(),
});

const projectsSchema = z.object({
  projects: z.array(z.object({ id: z.string(), name: z.string() })),
});

type ErrorStatus = 400 | 401 | 403 | 500 | 503;

function slugOf(c: Context<OidcEnv>): string {
  return c.get("tenantClient")?.tenantSlug ?? "unknown";
}

function toViewer(session: TenantSession): Viewer {
  return { name: session.name, email: session.email, csrfToken: session.csrfToken };
}

/**
 * Tenant Web Application。BFF として API をサーバー間で呼び、ブラウザには HTML と Cookie だけを返す。
 */
export function createTenantApp(options: TenantAppOptions): Hono<OidcEnv> {
  const { deps, provider, apiBaseUrl } = options;
  const app = new Hono<OidcEnv>();

  const renderError = (
    c: Context,
    title: string,
    message: string,
    status: ErrorStatus,
  ): Response | Promise<Response> => c.html(errorPage(hostSlug(c), title, message), status);

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
  app.use(
    tenantContext(deps, (c) =>
      renderError(c, "不明なテナントです", "このホストは登録されていません。", 400),
    ),
  );
  app.route("/", oidcRoutes(deps, provider, { renderError }));

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.get("/", (c) => {
    const session = c.get("tenantSession");
    return c.html(homePage(slugOf(c), session === undefined ? undefined : toViewer(session)));
  });

  app.get("/projects", requireSession(), async (c) => {
    const session = c.get("tenantSession");
    if (session === undefined) return c.redirect("/auth/login");
    return renderProjects(c, session, c.req.query("notice"));
  });

  app.post("/projects", requireSession(), async (c) => {
    const session = c.get("tenantSession");
    if (session === undefined) return c.redirect("/auth/login");
    const form = await c.req.parseBody();
    if (form.csrf !== session.csrfToken) {
      return renderError(
        c,
        "ページを再読み込みしてください",
        "フォームの有効期限が切れています。",
        403,
      );
    }
    const name = typeof form.name === "string" ? form.name.trim() : "";
    if (name === "") return c.redirect("/projects?notice=name+is+required");

    const result = await apiFetch(
      deps,
      provider,
      c.get("tenantClient"),
      session,
      `${apiBaseUrl}/v1/projects`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
    );
    if (!result.ok) return handleApiAccessError(c, result.error.kind);
    if (result.value.response.status === 403) {
      return c.redirect("/projects?notice=" + encodeURIComponent("この操作を行う権限がありません"));
    }
    if (!result.value.response.ok) {
      deps.logger.error("project creation failed", { status: result.value.response.status });
      return renderError(c, "一時的なエラーです", "しばらくしてから再試行してください。", 503);
    }
    return c.redirect("/projects");
  });

  async function renderProjects(
    c: Context<OidcEnv>,
    session: TenantSession,
    notice: string | undefined,
  ): Promise<Response> {
    const client = c.get("tenantClient");
    const me = await apiFetch(deps, provider, client, session, `${apiBaseUrl}/v1/me`);
    if (!me.ok) return handleApiAccessError(c, me.error.kind);
    if (me.value.response.status === 403) {
      return renderError(
        c,
        "アクセス権がありません",
        "このテナントへのアクセス権がありません。",
        403,
      );
    }
    const meBody = meSchema.safeParse(await me.value.response.json());
    if (!meBody.success)
      return renderError(c, "一時的なエラーです", "API 応答を解釈できません。", 503);

    const projects = await apiFetch(
      deps,
      provider,
      client,
      me.value.session,
      `${apiBaseUrl}/v1/projects`,
    );
    if (!projects.ok) return handleApiAccessError(c, projects.error.kind);
    const projectsBody = projectsSchema.safeParse(await projects.value.response.json());
    if (!projectsBody.success)
      return renderError(c, "一時的なエラーです", "API 応答を解釈できません。", 503);

    return c.html(
      projectsPage({
        tenantSlug: client.tenantSlug,
        viewer: toViewer(session),
        role: meBody.data.role,
        projects: projectsBody.data.projects,
        ...(notice !== undefined && { notice }),
      }),
    );
  }

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
      errorPage(hostSlug(c), "ページが見つかりません", "指定されたページは存在しません。"),
      404,
    ),
  );
  app.onError((error, c) => {
    deps.logger.error("unhandled error", { path: c.req.path, message: error.message });
    return c.html(
      errorPage(hostSlug(c), "一時的なエラーです", "しばらくしてから再試行してください。"),
      500,
    );
  });

  return app;
}

function hostSlug(c: Context): string {
  const host = c.req.header("host") ?? "";
  return host.split(".")[0] ?? "unknown";
}
