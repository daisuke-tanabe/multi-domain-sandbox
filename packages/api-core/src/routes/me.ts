import { Hono } from "hono";
import type { MeResponse } from "@sandbox/api-contract";
import type { ApiEnv } from "../auth/middleware.ts";
import { allPermissions, type ServiceDefinition } from "../service-definition.ts";

/**
 * /v1/me。このサービスでの役割と権限、サービスの語彙を返す。画面はこれで表示を出し分ける。
 */
export function meRoutes(definition: ServiceDefinition): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get("/v1/me", (c) => {
    const ctx = c.get("tenantContext");
    return c.json({
      user: { id: ctx.userId, email: ctx.member.email, name: ctx.member.name },
      tenant: { id: ctx.tenantId, slug: ctx.tenantSlug },
      role: ctx.member.role,
      permissions: [...ctx.permissions].sort(),
      service: {
        clientId: ctx.clientId,
        roles: [...definition.roles],
        permissions: [...allPermissions(definition)],
      },
    } satisfies MeResponse);
  });

  return app;
}
