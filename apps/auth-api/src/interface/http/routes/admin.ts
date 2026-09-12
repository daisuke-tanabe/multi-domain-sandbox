import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  idSchema,
  inviteServiceMemberInputSchema,
  revokeServiceMemberInputSchema,
  type InviteServiceMemberResponse,
  type ServiceMember as ServiceMemberJson,
  type ServiceMemberUser,
  type ServiceMembersResponse,
} from "@sandbox/api-contract";
import type { ServiceMember, User } from "../../../domain/identity.ts";
import type { AuthDeps } from "../../../application/deps.ts";
import {
  inviteServiceMember,
  listServiceMembers,
  revokeServiceMember,
  type ServiceMemberError,
} from "../../../application/usecases/service-members.ts";
import { clientAuth, type ClientEnv } from "./client-auth.ts";
import { invalidJson } from "./helpers.ts";

const tenantId: z.ZodString = idSchema;

function toUserJson(user: User): ServiceMemberUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    // 招待済みで一度もログインしていない人は Cognito の sub が未設定
    linked: user.cognitoSub !== null,
  };
}

function toMemberJson(member: ServiceMember): ServiceMemberJson {
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
    return c.json({ members: result.value.map(toMemberJson) } satisfies ServiceMembersResponse);
  });

  app.post(
    "/admin/service-members",
    zValidator("json", inviteServiceMemberInputSchema, invalidJson),
    async (c) => {
      const body = c.req.valid("json");
      const result = await inviteServiceMember(deps, c.get("client"), {
        tenantId: body.tenant_id,
        email: body.email,
        name: body.name ?? null,
      });
      if (!result.ok) return respondError(c, result.error);
      return c.json({ user: toUserJson(result.value) } satisfies InviteServiceMemberResponse, 201);
    },
  );

  app.delete(
    "/admin/service-members",
    zValidator("json", revokeServiceMemberInputSchema, invalidJson),
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
