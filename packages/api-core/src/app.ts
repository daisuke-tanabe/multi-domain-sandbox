import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { Clock, JwksSource, Logger } from "@sandbox/shared";
import { authenticate, type ApiEnv } from "./auth/middleware.ts";
import type { AuthAdminClient } from "./ports/auth-admin.ts";
import type { MemberRepository } from "./ports/member-repository.ts";
import { meRoutes } from "./routes/me.ts";
import { memberRoutes } from "./routes/members.ts";
import type { ServiceDefinition } from "./service-definition.ts";

export interface ApiAppOptions {
  readonly issuer: string;
  /** この API の公開 URL。aud として検証し、Host がこの URL のホストと違うリクエストは 404 */
  readonly audience: string;
  readonly jwks: JwksSource;
  readonly definition: ServiceDefinition;
  readonly members: MemberRepository;
  readonly authAdmin: AuthAdminClient;
  readonly clock: Clock;
  readonly logger: Logger;
  /** サービス固有のルート。/v1/* 配下に置き、authenticate の後ろに mount される */
  readonly routes: ReadonlyArray<Hono<ApiEnv>>;
}

/**
 * API Server の共通部分。Cookie は受け付けず Bearer のみ。ブラウザから直接呼ばれない前提のため CORS は設定しない。
 * /v1/me と管理アカウントのルートはどのサービスにも付く。
 */
export function createApiApp(options: ApiAppOptions): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.use(secureHeaders());
  app.use(bodyLimit({ maxSize: 64 * 1024 }));
  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.use("/v1/*", authenticate(options));
  app.route("/", meRoutes(options.definition));
  app.route("/", memberRoutes(options));
  for (const route of options.routes) app.route("/", route);

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    options.logger.error("unhandled error", { path: c.req.path, message: error.message });
    return c.json({ error: "server_error" }, 500);
  });

  return app;
}
