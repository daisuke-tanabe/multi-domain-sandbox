import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  endUserInputSchema,
  endUserPatchSchema,
  type EndUser as EndUserJson,
  type EndUserResponse,
  type EndUsersResponse,
} from "@sandbox/api-contract";
import { requirePermission, type ApiEnv, type NotFoundError } from "@sandbox/api-core";
import {
  createEndUser,
  deleteEndUser,
  getEndUser,
  listEndUsers,
  updateEndUser,
  type EndUserDeps,
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

function respondError(c: Context, error: NotFoundError): Response {
  return c.json({ error: error.kind }, 404);
}

/**
 * /v1/end-users。入力検証とユースケース呼び出しと契約の型への写しだけを行う。
 */
export function endUserRoutes(deps: EndUserDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const invalid = (result: { success: boolean }, c: Context) =>
    result.success ? undefined : c.json({ error: "invalid_request" }, 400);

  app.get("/v1/end-users", requirePermission("end_users:read"), async (c) => {
    const result = await listEndUsers(deps, c.get("tenantContext"));
    return c.json({
      end_users: result.endUsers.map(toJson),
      masked: result.masked,
    } satisfies EndUsersResponse);
  });

  app.get("/v1/end-users/:id", requirePermission("end_users:read"), async (c) => {
    const result = await getEndUser(deps, c.get("tenantContext"), c.req.param("id"));
    if (!result.ok) return respondError(c, result.error);
    return c.json({ end_user: toJson(result.value) } satisfies EndUserResponse);
  });

  app.post(
    "/v1/end-users",
    requirePermission("end_users:create"),
    zValidator("json", endUserInputSchema, invalid),
    async (c) => {
      const created = await createEndUser(deps, c.get("tenantContext"), c.req.valid("json"));
      return c.json({ end_user: toJson(created) } satisfies EndUserResponse, 201);
    },
  );

  app.patch(
    "/v1/end-users/:id",
    requirePermission("end_users:update"),
    zValidator("json", endUserPatchSchema, invalid),
    async (c) => {
      const result = await updateEndUser(
        deps,
        c.get("tenantContext"),
        c.req.param("id"),
        c.req.valid("json"),
      );
      if (!result.ok) return respondError(c, result.error);
      return c.json({ end_user: toJson(result.value) } satisfies EndUserResponse);
    },
  );

  app.delete("/v1/end-users/:id", requirePermission("end_users:delete"), async (c) => {
    const result = await deleteEndUser(deps, c.get("tenantContext"), c.req.param("id"));
    if (!result.ok) return respondError(c, result.error);
    return c.body(null, 204);
  });

  return app;
}
