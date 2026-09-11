import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Clock, JwksSource, Logger } from "@sandbox/shared";
import { authenticate, type ApiEnv } from "./auth/middleware.ts";
import type { IdentityReader } from "./ports/identity-reader.ts";
import type { ProjectRepository } from "./ports/project-repository.ts";
import { meRoutes } from "./routes/me.ts";
import { projectRoutes } from "./routes/projects.ts";

export interface ApiAppOptions {
  readonly issuer: string;
  /** この API の公開 URL。aud として検証し、Host がこの URL のホストと違うリクエストは 404 */
  readonly audience: string;
  readonly jwks: JwksSource;
  readonly identity: IdentityReader;
  readonly projects: ProjectRepository;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * API Server。Cookie は受け付けず Bearer のみ。ブラウザから直接呼ばれない前提のため CORS は設定しない。
 */
export function createApiApp(options: ApiAppOptions): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.use(secureHeaders());
  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.use("/v1/*", authenticate(options));
  app.route("/", meRoutes());
  app.route("/", projectRoutes(options.projects));

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    options.logger.error("unhandled error", { path: c.req.path, message: error.message });
    return c.json({ error: "server_error" }, 500);
  });

  return app;
}
