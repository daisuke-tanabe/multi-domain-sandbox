import { serve } from "@hono/node-server";
import {
  createApiApp,
  createPool,
  PgIdentityReader,
  PgProjectRepository,
  RemoteJwksSource,
} from "@sandbox/service-api";
import { createLogger, systemClock } from "@sandbox/shared";
import { loadConfig } from "./config.ts";

const logger = createLogger("crm-api");
const config = loadConfig();

const jwksUrl = `${config.AUTH_BACKCHANNEL_URL ?? config.ISSUER}/jwks`;
const pool = createPool(config.DATABASE_URL, (error) =>
  logger.error("database pool error", { message: error.message }),
);

const audience = `${config.PUBLIC_SCHEME}://${config.API_HOST}`;

const app = createApiApp({
  issuer: config.ISSUER,
  audiences: new Map([[config.API_HOST, audience]]),
  jwks: new RemoteJwksSource(jwksUrl, (input, init) => fetch(input, init), systemClock),
  identity: new PgIdentityReader(pool),
  projects: new PgProjectRepository(pool),
  clock: systemClock,
  logger,
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info("crm-api listening", { port: info.port, audience });
});
