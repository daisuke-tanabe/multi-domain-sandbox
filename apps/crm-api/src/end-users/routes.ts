import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ulid } from "ulid";
import {
  endUserInputSchema,
  endUserPatchSchema,
  type EndUser as EndUserJson,
  type EndUserResponse,
  type EndUsersResponse,
} from "@sandbox/api-contract";
import { requirePermission, type ApiEnv } from "@sandbox/api-core";
import type { EndUser, EndUserRepository } from "./repository.ts";

/** メールは先頭 1 文字とドメイン、電話は末尾 4 桁だけ残す */
export function mask(user: EndUser): EndUser {
  const [local = "", domain = ""] = user.email.split("@");
  const maskedEmail = `${local.slice(0, 1)}***@${domain}`;
  const digits = user.phone.replace(/\D/g, "");
  const maskedPhone = `***-****-${digits.slice(-4)}`;
  return { ...user, email: maskedEmail, phone: maskedPhone };
}

function toJson(user: EndUser, unmasked: boolean): EndUserJson {
  const shown = unmasked ? user : mask(user);
  return {
    id: shown.id,
    name: shown.name,
    email: shown.email,
    phone: shown.phone,
    note: shown.note,
    masked: !unmasked,
  };
}

/**
 * /v1/end-users。読み取りは誰でも。個人情報は end_users:unmask が無ければマスクして返す。
 */
export function endUserRoutes(repo: EndUserRepository): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const invalid = (result: { success: boolean }, c: Context) =>
    result.success ? undefined : c.json({ error: "invalid_request" }, 400);

  app.get("/v1/end-users", requirePermission("end_users:read"), async (c) => {
    const ctx = c.get("tenantContext");
    const unmasked = ctx.permissions.has("end_users:unmask");
    const rows = await repo.list(ctx.tenantId);
    return c.json({
      end_users: rows.map((u) => toJson(u, unmasked)),
      masked: !unmasked,
    } satisfies EndUsersResponse);
  });

  app.get("/v1/end-users/:id", requirePermission("end_users:read"), async (c) => {
    const ctx = c.get("tenantContext");
    const user = await repo.findById(ctx.tenantId, c.req.param("id"));
    if (user === undefined) return c.json({ error: "not_found" }, 404);
    return c.json({
      end_user: toJson(user, ctx.permissions.has("end_users:unmask")),
    } satisfies EndUserResponse);
  });

  app.post(
    "/v1/end-users",
    requirePermission("end_users:create"),
    zValidator("json", endUserInputSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const created = await repo.create(ctx.tenantId, ulid(), c.req.valid("json"));
      return c.json({ end_user: toJson(created, ctx.permissions.has("end_users:unmask")) }, 201);
    },
  );

  app.patch(
    "/v1/end-users/:id",
    requirePermission("end_users:update"),
    zValidator("json", endUserPatchSchema, invalid),
    async (c) => {
      const ctx = c.get("tenantContext");
      const updated = await repo.update(ctx.tenantId, c.req.param("id"), c.req.valid("json"));
      if (updated === undefined) return c.json({ error: "not_found" }, 404);
      return c.json({ end_user: toJson(updated, ctx.permissions.has("end_users:unmask")) });
    },
  );

  app.delete("/v1/end-users/:id", requirePermission("end_users:delete"), async (c) => {
    const ctx = c.get("tenantContext");
    const removed = await repo.remove(ctx.tenantId, c.req.param("id"));
    if (!removed) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  return app;
}
