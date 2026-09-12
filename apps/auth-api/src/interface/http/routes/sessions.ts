import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { SessionsResponse } from "@sandbox/api-contract";
import type { CookiePolicy } from "@sandbox/shared";
import { issueCsrfToken } from "../../../application/usecases/csrf.ts";
import type { AuthDeps } from "../../../application/deps.ts";
import { revokeSessionBySid } from "../../../application/usecases/global-logout.ts";
import { listUserSessions } from "../../../application/usecases/sessions.ts";
import { loadSsoSession } from "../../../application/usecases/sso-session.ts";
import {
  csrfCookie,
  invalidForm,
  rejectInvalidCsrf,
  requestEnvironment,
  ssoCookie,
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
  const sso = ssoCookie(policy);
  const csrf = csrfCookie(policy);

  app.get("/api/sessions", async (c) => {
    const session = await loadSsoSession(deps, sso.read(c));
    if (session === undefined) return c.json({ error: "unauthenticated" }, 401);
    const [sessions, mfaMethods, issued] = await Promise.all([
      listUserSessions(deps, session.userId),
      deps.identity.listMfaMethods(session.userId),
      issueCsrfToken(deps),
    ]);
    csrf.write(c, issued.cookieValue);
    return c.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        ip: s.ip,
        user_agent: s.userAgent,
        created_at: s.createdAt,
        last_seen_at: s.lastSeenAt,
        current: s.id === session.sid,
        services: s.services.map(({ client, tenant }) => ({
          client_id: client.clientId,
          name: client.name,
          tenant_slug: tenant.slug,
          tenant_name: tenant.name,
        })),
      })),
      mfa_methods: mfaMethods.map((m) => ({ method: m.method, enrolled_at: m.enrolledAt })),
      csrfToken: issued.formToken,
    } satisfies SessionsResponse);
  });

  app.post("/sessions/revoke", zValidator("form", revokeFormSchema, invalidForm), async (c) => {
    const form = c.req.valid("form");
    const session = await loadSsoSession(deps, sso.read(c));
    if (session === undefined) return c.redirect("/login", 303);
    const rejected = await rejectInvalidCsrf(c, deps, policy, form.csrf);
    if (rejected !== undefined) return rejected;
    // 自分のセッションだけを対象にする。他人の sid を指定しても何も起きない
    const target = await deps.sessions.findWithClients(form.session_id);
    if (target !== undefined && target.userId === session.userId && target.id !== session.sid) {
      await revokeSessionBySid(deps, target.id, "user_revoked", requestEnvironment(c));
    }
    return c.redirect("/security", 303);
  });

  return app;
}
