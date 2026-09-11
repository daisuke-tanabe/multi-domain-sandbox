import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { CookiePolicy } from "@sandbox/shared";
import { issueCsrfToken, verifyCsrfToken } from "../usecases/csrf.ts";
import type { AuthDeps } from "../usecases/deps.ts";
import { globalLogout } from "../usecases/global-logout.ts";
import { loadSsoSession } from "../usecases/sso-session.ts";
import { errorPage, logoutConfirmPage, logoutDonePage } from "../views/pages.ts";
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
 * Global Logout。docs/design/10-logout-design.md に対応する。
 * GET は確認画面、POST で SSO Session を破棄し各 Client へ Back-Channel Logout を送る。
 * 戻り先は登録済み Client の redirect_uri の origin からのみ導出する。Open Redirect を防ぐ。
 */
export function logoutRoutes(deps: AuthDeps, policy: CookiePolicy): Hono {
  const app = new Hono();

  app.get("/logout", async (c) => {
    noStore(c);
    const clientId = c.req.query("client_id");
    const tenantSlug = c.req.query("tenant");
    const session = await loadSsoSession(deps, readSsoCookie(c, policy));
    if (session === undefined) {
      clearSsoCookie(c, policy);
      return c.html(logoutDonePage({ returnTo: await returnTarget(deps, clientId, tenantSlug) }));
    }
    const csrf = await issueCsrfToken(deps);
    writeCsrfCookie(c, policy, csrf.cookieValue);
    return c.html(logoutConfirmPage({ csrfToken: csrf.formToken, clientId, tenantSlug }));
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
      return c.html(
        logoutDonePage({ returnTo: await returnTarget(deps, form.client_id, form.tenant) }),
      );
    },
  );

  return app;
}

async function returnTarget(
  deps: AuthDeps,
  clientId: string | undefined,
  tenantSlug: string | undefined,
): Promise<{ label: string; href: string } | undefined> {
  if (clientId === undefined) return undefined;
  const client = await deps.identity.findClient(clientId);
  if (client === undefined) return undefined;
  // 戻り先は登録済み redirect_uri の origin からのみ導出する。テナント指定があればそのテナントの行を使う
  const target =
    client.redirectTargets.find((t) => tenantSlug !== undefined && t.tenant?.slug === tenantSlug) ??
    client.redirectTargets[0];
  if (target === undefined) return undefined;
  const label = target.tenant === null ? client.name : `${client.name} (${target.tenant.slug})`;
  return { label, href: new URL(target.uri).origin + "/" };
}
