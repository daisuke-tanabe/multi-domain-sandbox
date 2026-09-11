import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Logger } from "@sandbox/shared";
import { requirePermission, type ApiEnv } from "../auth/middleware.ts";
import type { AuthAdminClient, AuthAdminError } from "../ports/auth-admin.ts";
import type { Member, MemberRepository } from "../ports/member-repository.ts";
import {
  isPermission,
  isRole,
  resolvePermissions,
  type ServiceDefinition,
} from "../service-definition.ts";

export interface MemberRoutesDeps {
  readonly definition: ServiceDefinition;
  readonly members: MemberRepository;
  readonly authAdmin: AuthAdminClient;
  readonly logger: Logger;
}

function toJson(member: Member) {
  return {
    user_id: member.userId,
    email: member.email,
    name: member.name,
    role: member.role,
    status: member.status,
  };
}

function respondAuthAdminError(c: Context, logger: Logger, error: AuthAdminError): Response {
  switch (error.kind) {
    case "tenant_not_found":
    case "not_contracted":
      return c.json({ error: error.kind }, 403);
    case "user_not_found":
      return c.json({ error: "not_found" }, 404);
    case "unavailable":
      logger.error("auth admin api unavailable", { reason: error.reason });
      return c.json({ error: "temporarily_unavailable" }, 503);
  }
}

/**
 * 管理アカウントの一覧、招待、役割変更、権限の上書き、削除。
 * 招待と削除は auth-api の管理 API で「入れるか」を変え、役割と上書きは自分の DB に持つ。
 */
export function memberRoutes(deps: MemberRoutesDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const { definition, members, authAdmin, logger } = deps;

  const roleSchema = z.string().refine((value) => isRole(definition, value), "unknown role");
  const overrideSchema = z.object({
    permission: z.string().refine((value) => isPermission(definition, value), "unknown permission"),
    effect: z.enum(["allow", "deny"]),
  });
  const inviteSchema = z.object({
    email: z.string().email().max(254),
    name: z.string().trim().min(1).max(100).optional(),
    role: roleSchema,
  });
  const patchSchema = z.object({ role: roleSchema });
  const permissionsSchema = z.object({ overrides: z.array(overrideSchema).max(50) });
  const invalid = (result: { success: boolean }, c: Context) =>
    result.success ? undefined : c.json({ error: "invalid_request" }, 400);

  app.get("/v1/members", requirePermission("members:read"), async (c) => {
    const ctx = c.get("tenantContext");
    const list = await members.list(ctx.tenantId);
    return c.json({ members: list.map(toJson) });
  });

  app.get("/v1/members/:userId", requirePermission("members:read"), async (c) => {
    const ctx = c.get("tenantContext");
    const member = await members.find(ctx.tenantId, c.req.param("userId"));
    if (member === undefined) return c.json({ error: "not_found" }, 404);
    const overrides = await members.listOverrides(ctx.tenantId, member.userId);
    return c.json({
      member: toJson(member),
      overrides,
      permissions: [...resolvePermissions(definition, member.role, overrides)].sort(),
    });
  });

  app.post(
    "/v1/members",
    requirePermission("members:invite"),
    zValidator("json", inviteSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const body = c.req.valid("json");
      // 先に auth に「入れる」を登録し、その user_id で自分の member 行を作る
      const invited = await authAdmin.invite({
        tenantId: ctx.tenantId,
        email: body.email,
        name: body.name ?? null,
      });
      if (!invited.ok) return respondAuthAdminError(c, logger, invited.error);
      const member = await members.upsert({
        tenantId: ctx.tenantId,
        userId: invited.value.userId,
        email: invited.value.email,
        name: invited.value.name,
        role: body.role,
        status: "active",
      });
      logger.info("member invited", { tenantId: ctx.tenantId, userId: member.userId });
      return c.json({ member: toJson(member), linked: invited.value.linked }, 201);
    },
  );

  app.patch(
    "/v1/members/:userId",
    requirePermission("members:manage"),
    zValidator("json", patchSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const existing = await members.find(ctx.tenantId, c.req.param("userId"));
      if (existing === undefined) return c.json({ error: "not_found" }, 404);
      const member = await members.upsert({ ...existing, role: c.req.valid("json").role });
      return c.json({ member: toJson(member) });
    },
  );

  app.put(
    "/v1/members/:userId/permissions",
    requirePermission("members:manage"),
    zValidator("json", permissionsSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const existing = await members.find(ctx.tenantId, c.req.param("userId"));
      if (existing === undefined) return c.json({ error: "not_found" }, 404);
      const overrides = c.req.valid("json").overrides;
      await members.replaceOverrides(ctx.tenantId, existing.userId, overrides);
      return c.json({
        overrides,
        permissions: [...resolvePermissions(definition, existing.role, overrides)].sort(),
      });
    },
  );

  app.delete("/v1/members/:userId", requirePermission("members:manage"), async (c) => {
    const ctx = c.get("tenantContext");
    const userId = c.req.param("userId");
    if (userId === ctx.userId) return c.json({ error: "cannot_remove_self" }, 400);
    const existing = await members.find(ctx.tenantId, userId);
    if (existing === undefined) return c.json({ error: "not_found" }, 404);
    const revoked = await authAdmin.revoke({ tenantId: ctx.tenantId, userId });
    if (!revoked.ok && revoked.error.kind !== "user_not_found") {
      return respondAuthAdminError(c, logger, revoked.error);
    }
    await members.remove(ctx.tenantId, userId);
    logger.info("member removed", { tenantId: ctx.tenantId, userId });
    return c.body(null, 204);
  });

  return app;
}
