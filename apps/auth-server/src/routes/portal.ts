import { Hono } from "hono";
import type { CookiePolicy } from "@sandbox/shared";
import type { AuthDeps } from "../usecases/deps.ts";
import { loadSsoSession } from "../usecases/sso-session.ts";
import { portalPage } from "../views/pages.ts";
import { noStore, readSsoCookie } from "./helpers.ts";

/**
 * ポータル。auth.sandbox.com を直接開いたときの入口。
 * SSO Session がなければ rid なしのログインフォームへ送り、ログイン後にここへ戻る。
 * 一覧のリンク先はテナント側の /auth/login。Third-Party Initiated Login の形で通常のフローに合流する。
 */
export function portalRoutes(deps: AuthDeps, policy: CookiePolicy): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    noStore(c);
    const session = await loadSsoSession(deps, readSsoCookie(c, policy));
    if (session === undefined) return c.redirect("/login");

    const user = await deps.identity.findUserById(session.userId);
    if (user === undefined || user.status !== "active") return c.redirect("/login");

    const entries = await deps.identity.listPortalEntries(session.userId);
    return c.html(
      portalPage({
        email: user.email,
        tenants: entries.map((entry) => ({
          slug: entry.tenant.slug,
          name: entry.tenant.name,
          role: entry.role,
          services: entry.services.map((service) => ({
            name: service.name,
            clientId: service.clientId,
            loginUrl: `${service.origin}/auth/login`,
          })),
        })),
      }),
    );
  });

  return app;
}
