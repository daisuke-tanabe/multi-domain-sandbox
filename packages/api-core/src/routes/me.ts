import { Hono } from "hono";
import { requirePermission, type ApiEnv } from "../auth/middleware.ts";

/**
 * /v1/me。認証済みユーザー、現在のテナント、このサービスでの役割と権限を返す。
 */
export function meRoutes(): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get("/v1/me", requirePermission("tenant:read"), (c) => {
    const user = c.get("user");
    const tenant = c.get("tenant");
    const ctx = c.get("tenantContext");
    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: tenant.id, slug: tenant.slug },
      role: ctx.role,
      permissions: [...ctx.permissions].sort(),
    });
  });

  return app;
}
