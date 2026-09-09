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
    const session = await loadSsoSession(deps, readSsoCookie(c, policy));
    if (session === undefined) {
      clearSsoCookie(c, policy);
      return c.html(logoutDonePage({ returnTo: await returnTarget(deps, clientId) }));
    }
    const csrf = await issueCsrfToken(deps);
    writeCsrfCookie(c, policy, csrf.cookieValue);
    return c.html(logoutConfirmPage({ csrfToken: csrf.formToken, clientId }));
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
      return c.html(logoutDonePage({ returnTo: await returnTarget(deps, form.client_id) }));
    },
  );

  return app;
}

async function returnTarget(
  deps: AuthDeps,
  clientId: string | undefined,
): Promise<{ label: string; href: string } | undefined> {
  if (clientId === undefined) return undefined;
  const client = await deps.identity.findClient(clientId);
  const redirectUri = client?.redirectUris[0];
  if (client === undefined || redirectUri === undefined) return undefined;
  return { label: client.tenant?.slug ?? client.clientId, href: new URL(redirectUri).origin + "/" };
}
