import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { ServiceMember, User } from "../ports/identity-repository.ts";
import type { AuthDeps } from "../usecases/deps.ts";
import {
  inviteServiceMember,
  listServiceMembers,
  revokeServiceMember,
  type ServiceMemberError,
} from "../usecases/service-members.ts";
import { clientAuth, type ClientEnv } from "./client-auth.ts";

const tenantId = z.string().min(1).max(64);

const inviteSchema = z.object({
  tenant_id: tenantId,
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(100).optional(),
});

const revokeSchema = z.object({
  tenant_id: tenantId,
  user_id: z.string().min(1),
});

function toUserJson(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    // 招待済みで一度もログインしていない人は Cognito の sub が未設定
    linked: user.cognitoSub !== null,
  };
}

function toMemberJson(member: ServiceMember) {
  return { ...toUserJson(member.user), status: member.status };
}

function respondError(c: Context, error: ServiceMemberError): Response {
  switch (error.kind) {
    case "tenant_not_found":
      return c.json({ error: "tenant_not_found" }, 404);
    case "not_contracted":
      return c.json({ error: "not_contracted" }, 403);
    case "user_not_found":
      return c.json({ error: "user_not_found" }, 404);
  }
}

/**
 * サービス向けの管理 API。Back Channel 専用で client_secret_basic を要求する。
 * Client は自分のサービスへの割り当てだけを操作できる。役割はサービス側が自分の DB に持つ。
 */
export function adminRoutes(deps: AuthDeps): Hono<ClientEnv> {
  const app = new Hono<ClientEnv>();
  app.use("/admin/*", clientAuth(deps, "admin"));

  app.get("/admin/service-members", async (c) => {
    const parsed = tenantId.safeParse(c.req.query("tenant_id"));
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    const result = await listServiceMembers(deps, c.get("client"), parsed.data);
    if (!result.ok) return respondError(c, result.error);
    return c.json({ members: result.value.map(toMemberJson) });
  });

  app.post(
    "/admin/service-members",
    zValidator("json", inviteSchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_request" }, 400);
      return undefined;
    }),
    async (c) => {
      const body = c.req.valid("json");
      const result = await inviteServiceMember(deps, c.get("client"), {
        tenantId: body.tenant_id,
        email: body.email,
        name: body.name ?? null,
      });
      if (!result.ok) return respondError(c, result.error);
      return c.json({ user: toUserJson(result.value) }, 201);
    },
  );

  app.delete(
    "/admin/service-members",
    zValidator("json", revokeSchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_request" }, 400);
      return undefined;
    }),
    async (c) => {
      const body = c.req.valid("json");
      const result = await revokeServiceMember(deps, c.get("client"), {
        tenantId: body.tenant_id,
        userId: body.user_id,
      });
      if (!result.ok) return respondError(c, result.error);
      return c.body(null, 204);
    },
  );

  return app;
}
