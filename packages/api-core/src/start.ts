import { serve } from "@hono/node-server";
import {
  createLogger,
  createPool,
  nodeFetch,
  RemoteJwksSource,
  systemClock,
} from "@sandbox/shared";
import {
  PgIdentityReader,
  PgPermissionReader,
  PgProjectRepository,
} from "./adapters/pg-repositories.ts";
import { createApiApp } from "./app.ts";
import { loadApiCoreConfig } from "./config.ts";

/**
 * サービスの API を起動する。apps/<service>-api/src/main.ts はこれを呼ぶだけ。
 */
export function startApiCore(component: string): void {
  const logger = createLogger(component);
  const config = loadApiCoreConfig(component);
  const pool = createPool(config.DATABASE_URL, logger);
  const jwksUrl = `${config.AUTH_BACKCHANNEL_URL ?? config.ISSUER}/jwks`;

  const app = createApiApp({
    issuer: config.ISSUER,
    audience: config.API_BASE_URL,
    jwks: new RemoteJwksSource(jwksUrl, nodeFetch, systemClock),
    identity: new PgIdentityReader(pool),
    permissions: new PgPermissionReader(pool),
    projects: new PgProjectRepository(pool),
    clock: systemClock,
    logger,
  });

  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info(`${component} listening`, { port: info.port, audience: config.API_BASE_URL });
  });
}
