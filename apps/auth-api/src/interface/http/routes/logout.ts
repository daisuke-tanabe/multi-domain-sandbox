import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { LogoutResponse } from "@sandbox/api-contract";
import { serviceOrigin, type CookiePolicy } from "@sandbox/shared";
import { issueCsrfToken } from "../../../application/usecases/csrf.ts";
import type { AuthDeps } from "../../../application/deps.ts";
import { globalLogout } from "../../../application/usecases/global-logout.ts";
import { loadSsoSession } from "../../../application/usecases/sso-session.ts";
import {
  csrfCookie,
  invalidForm,
  rejectInvalidCsrf,
  requestEnvironment,
  ssoCookie,
  withQuery,
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
  const sso = ssoCookie(policy);
  const csrf = csrfCookie(policy);

  app.get("/api/logout", async (c) => {
    const returnTo = await returnTarget(deps, c.req.query("client_id"), c.req.query("tenant"));
    const session = await loadSsoSession(deps, sso.read(c));
    if (session === undefined) {
      sso.clear(c);
      return c.json({ authenticated: false, returnTo } satisfies LogoutResponse);
    }
    const issued = await issueCsrfToken(deps);
    csrf.write(c, issued.cookieValue);
    return c.json({
      authenticated: true,
      csrfToken: issued.formToken,
      returnTo,
    } satisfies LogoutResponse);
  });

  app.post("/logout", zValidator("form", logoutFormSchema, invalidForm), async (c) => {
    const form = c.req.valid("form");
    const rejected = await rejectInvalidCsrf(c, deps, policy, form.csrf);
    if (rejected !== undefined) return rejected;

    const session = await loadSsoSession(deps, sso.read(c));
    if (session !== undefined) await globalLogout(deps, session, requestEnvironment(c));
    sso.clear(c);
    return c.redirect(
      withQuery("/logout", { client_id: form.client_id, tenant: form.tenant }),
      303,
    );
  });

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
  return {
    label: `${client.name} (${tenant.slug})`,
    href: `${serviceOrigin(client.redirectUriTemplate, tenant.slug)}/`,
  };
}
