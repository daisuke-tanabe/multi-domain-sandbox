import { Hono } from "hono";
import type { PortalResponse } from "@sandbox/api-contract";
import type { CookiePolicy } from "@sandbox/shared";
import type { AuthDeps } from "../../../application/deps.ts";
import { loadSsoSession } from "../../../application/usecases/sso-session.ts";
import { ssoCookie } from "./helpers.ts";

/**
 * ポータル。auth.sandbox.com を直接開いたときの入口。画面は apps/auth-web の SPA が描く。
 * SSO Session がなければ 401 を返し、SPA が rid なしのログイン画面へ送る。
 * 一覧はサービスごとの割り当て (tenant_service_members) から作る。
 * リンク先はサービス側の /auth/login。Third-Party Initiated Login の形で通常のフローに合流する。
 */
export function portalRoutes(deps: AuthDeps, policy: CookiePolicy): Hono {
  const app = new Hono();

  app.get("/api/portal", async (c) => {
    const session = await loadSsoSession(deps, ssoCookie(policy).read(c));
    if (session === undefined) return c.json({ error: "unauthenticated" }, 401);

    const user = await deps.identity.findUserById(session.userId);
    if (user === undefined || user.status !== "active") {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const entries = await deps.identity.listPortalEntries(session.userId);
    return c.json({
      email: user.email,
      tenants: entries.map((entry) => ({
        slug: entry.tenant.slug,
        name: entry.tenant.name,
        services: entry.services.map((service) => ({
          name: service.name,
          clientId: service.clientId,
          loginUrl: `${service.origin}/auth/login`,
        })),
      })),
    } satisfies PortalResponse);
  });

  return app;
}
