import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  inviteMemberInputSchema,
  memberPatchSchema,
  permissionOverrideSchema,
  permissionOverridesInputSchema,
  type InviteMemberResponse,
  type Member as MemberJson,
  type MemberDetailResponse,
  type MemberResponse,
  type MembersResponse,
  type PermissionOverridesResponse,
} from "@sandbox/api-contract";
import type { Logger } from "@sandbox/shared";
import {
  changeMemberRole,
  getMemberDetail,
  inviteMember,
  listMembers,
  removeMember,
  replaceMemberOverrides,
  type MemberError,
  type MemberUsecaseDeps,
} from "../../../application/members.ts";
import type { Member } from "../../../domain/member.ts";
import { isPermission, isRole } from "../../../domain/service-definition.ts";
import { requirePermission, type ApiEnv } from "../middleware.ts";

export type MemberRoutesDeps = MemberUsecaseDeps;

function toJson(member: Member): MemberJson {
  return {
    user_id: member.userId,
    email: member.email,
    name: member.name,
    role: member.role,
    status: member.status,
  };
}

function respondError(c: Context, logger: Logger, error: MemberError): Response {
  switch (error.kind) {
    case "not_found":
      return c.json({ error: "not_found" }, 404);
    case "cannot_remove_self":
      return c.json({ error: "cannot_remove_self" }, 400);
    case "auth_admin":
      switch (error.error.kind) {
        case "tenant_not_found":
        case "not_contracted":
          return c.json({ error: error.error.kind }, 403);
        case "user_not_found":
          return c.json({ error: "not_found" }, 404);
        case "unavailable":
          logger.error("auth admin api unavailable", { reason: error.error.reason });
          return c.json({ error: "temporarily_unavailable" }, 503);
      }
  }
}

/**
 * /v1/members。入力検証とユースケース呼び出しと契約の型への写しだけを行う。
 */
export function memberRoutes(deps: MemberRoutesDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const { definition, logger } = deps;

  // 契約は役割名と権限名を文字列にしている。サービス定義で決まる制約はここで重ねる
  const roleSchema = z.string().refine((value) => isRole(definition, value), "unknown role");
  const overrideSchema = permissionOverrideSchema.extend({
    permission: z.string().refine((value) => isPermission(definition, value), "unknown permission"),
  });
  const inviteSchema = inviteMemberInputSchema.extend({ role: roleSchema });
  const patchSchema = memberPatchSchema.extend({ role: roleSchema });
  const permissionsSchema = permissionOverridesInputSchema.extend({
    overrides: z.array(overrideSchema).max(50),
  });
  const invalid = (result: { success: boolean }, c: Context) =>
    result.success ? undefined : c.json({ error: "invalid_request" }, 400);

  app.get("/v1/members", requirePermission("members:read"), async (c) => {
    const ctx = c.get("tenantContext");
    const list = await listMembers(deps, ctx.tenantId);
    return c.json({ members: list.map(toJson) } satisfies MembersResponse);
  });

  app.get("/v1/members/:userId", requirePermission("members:read"), async (c) => {
    const ctx = c.get("tenantContext");
    const result = await getMemberDetail(deps, ctx.tenantId, c.req.param("userId"));
    if (!result.ok) return respondError(c, logger, result.error);
    return c.json({
      member: toJson(result.value.member),
      overrides: [...result.value.overrides],
      permissions: [...result.value.permissions].sort(),
    } satisfies MemberDetailResponse);
  });

  app.post(
    "/v1/members",
    requirePermission("members:invite"),
    zValidator("json", inviteSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const body = c.req.valid("json");
      const result = await inviteMember(deps, ctx.tenantId, {
        email: body.email,
        name: body.name ?? null,
        role: body.role,
      });
      if (!result.ok) return respondError(c, logger, result.error);
      return c.json(
        {
          member: toJson(result.value.member),
          linked: result.value.linked,
        } satisfies InviteMemberResponse,
        201,
      );
    },
  );

  app.patch(
    "/v1/members/:userId",
    requirePermission("members:manage"),
    zValidator("json", patchSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const result = await changeMemberRole(
        deps,
        ctx.tenantId,
        c.req.param("userId"),
        c.req.valid("json").role,
      );
      if (!result.ok) return respondError(c, logger, result.error);
      return c.json({ member: toJson(result.value) } satisfies MemberResponse);
    },
  );

  app.put(
    "/v1/members/:userId/permissions",
    requirePermission("members:manage"),
    zValidator("json", permissionsSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const result = await replaceMemberOverrides(
        deps,
        ctx.tenantId,
        c.req.param("userId"),
        c.req.valid("json").overrides,
      );
      if (!result.ok) return respondError(c, logger, result.error);
      return c.json({
        overrides: [...result.value.overrides],
        permissions: [...result.value.permissions].sort(),
      } satisfies PermissionOverridesResponse);
    },
  );

  app.delete("/v1/members/:userId", requirePermission("members:manage"), async (c) => {
    const ctx = c.get("tenantContext");
    const result = await removeMember(deps, ctx.tenantId, ctx.userId, c.req.param("userId"));
    if (!result.ok) return respondError(c, logger, result.error);
    return c.body(null, 204);
  });

  return app;
}
