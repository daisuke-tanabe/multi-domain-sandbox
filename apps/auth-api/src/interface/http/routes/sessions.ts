import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { SessionsResponse } from "@sandbox/api-contract";
import type { CookiePolicy } from "@sandbox/shared";
import { issueCsrfToken, verifyCsrfToken } from "../../../application/usecases/csrf.ts";
import type { AuthDeps } from "../../../application/deps.ts";
import { revokeSessionBySid } from "../../../application/usecases/global-logout.ts";
import { listUserSessions } from "../../../application/usecases/sessions.ts";
import { loadSsoSession } from "../../../application/usecases/sso-session.ts";
import { errorPage } from "../views/pages.ts";
import {
  noStore,
  readCsrfCookie,
  readSsoCookie,
  requestEnvironment,
  writeCsrfCookie,
} from "./helpers.ts";

const revokeFormSchema = z.object({
  csrf: z.string().min(1),
  session_id: z.string().min(1).max(128),
});

/**
 * ポータルの「セキュリティ」。画面は apps/auth-web の SPA が描く。
 *   GET  /api/sessions      本人のログイン中のセッションと、失効フォームの CSRF
 *   POST /sessions/revoke   フォーム POST。自分の別の端末のセッションを失効させ、/security へ戻す
 */
export function sessionRoutes(deps: AuthDeps, policy: CookiePolicy): Hono {
  const app = new Hono();

  app.get("/api/sessions", async (c) => {
    noStore(c);
    const session = await loadSsoSession(deps, readSsoCookie(c, policy));
    if (session === undefined) return c.json({ error: "unauthenticated" }, 401);
    const [sessions, mfaMethods, csrf] = await Promise.all([
      listUserSessions(deps, session.userId),
      deps.identity.listMfaMethods(session.userId),
      issueCsrfToken(deps),
    ]);
    writeCsrfCookie(c, policy, csrf.cookieValue);
    return c.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        ip: s.ip,
        user_agent: s.userAgent,
        created_at: s.createdAt,
        last_seen_at: s.lastSeenAt,
        current: s.id === session.sid,
        services: s.services.map((service) => ({
          client_id: service.clientId,
          name: service.name,
          tenant_slug: service.tenantSlug,
          tenant_name: service.tenantName,
        })),
      })),
      mfa_methods: mfaMethods.map((m) => ({ method: m.method, enrolled_at: m.enrolledAt })),
      csrfToken: csrf.formToken,
    } satisfies SessionsResponse);
  });

  app.post(
    "/sessions/revoke",
    zValidator("form", revokeFormSchema, (result, c) => {
      if (!result.success)
        return c.html(errorPage("無効なリクエストです", "入力内容が正しくありません。"), 400);
      return undefined;
    }),
    async (c) => {
      noStore(c);
      const form = c.req.valid("form");
      const session = await loadSsoSession(deps, readSsoCookie(c, policy));
      if (session === undefined) return c.redirect("/login", 303);
      const csrfValid = await verifyCsrfToken(deps, readCsrfCookie(c, policy), form.csrf);
      if (!csrfValid) {
        deps.logger.warn("session revoke csrf mismatch");
        return c.html(
          errorPage("ページを再読み込みしてください", "フォームの有効期限が切れています。"),
          403,
        );
      }
      // 自分のセッションだけを対象にする。他人の sid を指定しても何も起きない
      const target = await deps.sessions.find(form.session_id);
      if (target !== undefined && target.userId === session.userId && target.id !== session.sid) {
        await revokeSessionBySid(deps, target.id, "user_revoked", requestEnvironment(c));
      }
      return c.redirect("/security", 303);
    },
  );

  return app;
}
