import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  endUserInputSchema,
  endUserPatchSchema,
  type EndUser as EndUserJson,
  type EndUserResponse,
  type EndUsersResponse,
} from "@sandbox/api-contract";
import { invalidJson, notFoundResponse, requirePermission, type ApiEnv } from "@sandbox/api-core";
import type { EndUserRepository } from "../application/end-user-repository.ts";
import {
  createEndUser,
  deleteEndUser,
  getEndUser,
  listEndUsers,
  updateEndUser,
} from "../application/end-users.ts";
import type { EndUserView } from "../domain/end-user.ts";

function toJson(user: EndUserView): EndUserJson {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    note: user.note,
    masked: user.masked,
  };
}

/**
 * /v1/end-users。入力検証とユースケース呼び出しと契約の型への写しだけを行う。
 */
export function endUserRoutes(endUsers: EndUserRepository): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get("/v1/end-users", requirePermission("end_users:read"), async (c) => {
    const result = await listEndUsers(endUsers, c.get("tenantContext"));
    return c.json({
      end_users: result.endUsers.map(toJson),
      masked: result.masked,
    } satisfies EndUsersResponse);
  });

  app.get("/v1/end-users/:id", requirePermission("end_users:read"), async (c) => {
    const result = await getEndUser(endUsers, c.get("tenantContext"), c.req.param("id"));
    if (!result.ok) return notFoundResponse(c);
    return c.json({ end_user: toJson(result.value) } satisfies EndUserResponse);
  });

  app.post(
    "/v1/end-users",
    requirePermission("end_users:create"),
    zValidator("json", endUserInputSchema, invalidJson),
    async (c) => {
      const created = await createEndUser(endUsers, c.get("tenantContext"), c.req.valid("json"));
      return c.json({ end_user: toJson(created) } satisfies EndUserResponse, 201);
    },
  );

  app.patch(
    "/v1/end-users/:id",
    requirePermission("end_users:update"),
    zValidator("json", endUserPatchSchema, invalidJson),
    async (c) => {
      const result = await updateEndUser(
        endUsers,
        c.get("tenantContext"),
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!result.ok) return notFoundResponse(c);
      return c.json({ end_user: toJson(result.value) } satisfies EndUserResponse);
    },
  );

  app.delete("/v1/end-users/:id", requirePermission("end_users:delete"), async (c) => {
    const result = await deleteEndUser(endUsers, c.get("tenantContext"), c.req.param("id"));
    if (!result.ok) return notFoundResponse(c);
    return c.body(null, 204);
  });

  return app;
}
