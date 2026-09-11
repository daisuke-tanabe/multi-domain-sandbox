import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { expandRedirectUriTemplate, type CookiePolicy } from "@sandbox/shared";
import { issueCsrfToken, verifyCsrfToken } from "../usecases/csrf.ts";
import type { AuthDeps } from "../usecases/deps.ts";
import { globalLogout } from "../usecases/global-logout.ts";
import { loadSsoSession } from "../usecases/sso-session.ts";
import { errorPage } from "../views/pages.ts";
import {
  clearSsoCookie,
  noStore,
  readCsrfCookie,
  readSsoCookie,
  writeCsrfCookie,
} from "./helpers.ts";

const logoutFormSchema = z.object({
  csrf: z.string().min(1),
  client_id: z.string().optional(),
  tenant: z.string().optional(),
});

/**
 * Global Logout。docs/design/10-logout-design.md に対応する。画面は apps/auth-web の SPA が描く。
 *   GET  /api/logout  SSO Session があれば確認フォームの材料、なければ完了の状態を返す
 *   POST /logout      SSO Session を破棄し各 Client へ Back-Channel Logout を送り、/logout へ戻す
 * 戻り先は Client の redirect_uri テンプレートをテナントで展開した origin からのみ導出する。Open Redirect を防ぐ。
 */
export function logoutRoutes(deps: AuthDeps, policy: CookiePolicy): Hono {
  const app = new Hono();

  app.get("/api/logout", async (c) => {
    noStore(c);
    const clientId = c.req.query("client_id");
    const tenantSlug = c.req.query("tenant");
    const returnTo = await returnTarget(deps, clientId, tenantSlug);
    const session = await loadSsoSession(deps, readSsoCookie(c, policy));
    if (session === undefined) {
      clearSsoCookie(c, policy);
      return c.json({ authenticated: false, returnTo });
    }
    const csrf = await issueCsrfToken(deps);
    writeCsrfCookie(c, policy, csrf.cookieValue);
    return c.json({ authenticated: true, csrfToken: csrf.formToken, returnTo });
  });

  app.post(
    "/logout",
    zValidator("form", logoutFormSchema, (result, c) => {
      if (!result.success)
        return c.html(errorPage("無効なリクエストです", "入力内容が正しくありません。"), 400);
      return undefined;
    }),
    async (c) => {
      noStore(c);
      const form = c.req.valid("form");
      const csrfValid = await verifyCsrfToken(deps, readCsrfCookie(c, policy), form.csrf);
      if (!csrfValid) {
        deps.logger.warn("logout csrf mismatch");
        return c.html(
          errorPage("ページを再読み込みしてください", "フォームの有効期限が切れています。"),
          403,
        );
      }

      const session = await loadSsoSession(deps, readSsoCookie(c, policy));
      if (session !== undefined) await globalLogout(deps, session);
      clearSsoCookie(c, policy);
      const params = new URLSearchParams();
      if (form.client_id !== undefined) params.set("client_id", form.client_id);
      if (form.tenant !== undefined) params.set("tenant", form.tenant);
      const query = params.toString();
      return c.redirect(query === "" ? "/logout" : `/logout?${query}`, 303);
    },
  );

  return app;
}

async function returnTarget(
  deps: AuthDeps,
  clientId: string | undefined,
  tenantSlug: string | undefined,
): Promise<{ label: string; href: string } | undefined> {
  if (clientId === undefined || tenantSlug === undefined) return undefined;
  const [client, tenant] = await Promise.all([
    deps.identity.findClient(clientId),
    deps.identity.findTenantBySlug(tenantSlug),
  ]);
  if (client === undefined || tenant === undefined) return undefined;
  const origin = new URL(expandRedirectUriTemplate(client.redirectUriTemplate, tenant.slug)).origin;
  return { label: `${client.name} (${tenant.slug})`, href: `${origin}/` };
}
