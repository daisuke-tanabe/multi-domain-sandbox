import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ulid } from "ulid";
import { z } from "zod";
import { requirePermission, type ApiEnv } from "../auth/middleware.ts";
import type { ProjectRepository } from "../ports/project-repository.ts";

const createProjectSchema = z.object({ name: z.string().trim().min(1).max(100) });

function toResponse(project: { id: string; name: string; createdBy: string }) {
  return { id: project.id, name: project.name, created_by: project.createdBy };
}

/**
 * /v1/projects。パスにテナントを含めない。テナントは TenantContext から決まる。
 */
export function projectRoutes(projects: ProjectRepository): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get("/v1/projects", requirePermission("projects:read"), async (c) => {
    const rows = await projects.list(c.get("tenantContext"));
    return c.json({ projects: rows.map(toResponse) });
  });

  app.get("/v1/projects/:id", requirePermission("projects:read"), async (c) => {
    const project = await projects.findById(c.get("tenantContext"), c.req.param("id"));
    // 他テナントの ID でも 404。存在の有無を漏らさない
    if (project === undefined) return c.json({ error: "not_found" }, 404);
    return c.json({ project: toResponse(project) });
  });

  app.post(
    "/v1/projects",
    requirePermission("projects:write"),
    zValidator("json", createProjectSchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_request" }, 400);
      return undefined;
    }),
    async (c) => {
      const body = c.req.valid("json");
      const project = await projects.create(c.get("tenantContext"), {
        id: ulid(),
        name: body.name,
      });
      return c.json({ project: toResponse(project) }, 201);
    },
  );

  return app;
}
