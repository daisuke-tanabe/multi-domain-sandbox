import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import type { Pool } from "pg";
import {
  createLogger,
  createPool,
  nodeFetch,
  RemoteJwksSource,
  systemClock,
} from "@sandbox/shared";
import { HttpAuthAdminClient } from "./infrastructure/auth-admin-client.ts";
import { PgMemberRepository } from "./infrastructure/pg-member-repository.ts";
import { createApiApp } from "./interface/http/app.ts";
import type { ApiEnv } from "./interface/http/middleware.ts";
import { loadApiCoreConfig } from "./config.ts";
import type { ServiceDefinition } from "./domain/service-definition.ts";

export interface ServiceApiSpec {
  readonly definition: ServiceDefinition;
  /** members と permission_overrides を置くスキーマ。db/<service>/init と一致させる */
  readonly schema: string;
  /** サービス固有のルート。pool を受け取って Repository を組み立てる */
  readonly routes: (pool: Pool) => ReadonlyArray<Hono<ApiEnv>>;
}

/**
 * サービスの API を起動する。apps/<service>-api/src/main.ts は定義とルートを渡してこれを呼ぶ。
 */
export function startApiCore(component: string, spec: ServiceApiSpec): void {
  const logger = createLogger(component);
  const config = loadApiCoreConfig(component);
  const pool = createPool(config.DATABASE_URL, logger);
  const authBase = config.AUTH_BACKCHANNEL_URL ?? config.ISSUER;

  const app = createApiApp({
    issuer: config.ISSUER,
    audience: config.API_BASE_URL,
    jwks: new RemoteJwksSource(`${authBase}/jwks`, nodeFetch, systemClock),
    definition: spec.definition,
    members: new PgMemberRepository(pool, spec.schema),
    authAdmin: new HttpAuthAdminClient({
      baseUrl: authBase,
      clientId: config.CLIENT_ID,
      clientSecret: config.CLIENT_SECRET,
      fetch: nodeFetch,
    }),
    clock: systemClock,
    logger,
    routes: spec.routes(pool),
  });

  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info(`${component} listening`, { port: info.port, audience: config.API_BASE_URL });
  });
}
