import { serve } from "@hono/node-server";
import { createLogger, systemClock } from "@sandbox/shared";
import { createPool, PgIdentityReader, PgProjectRepository } from "./adapters/pg-repositories.ts";
import { RemoteJwksSource } from "./adapters/remote-jwks-source.ts";
import { createApiApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const logger = createLogger("api-server");
const config = loadConfig();

const jwksUrl = `${config.AUTH_BACKCHANNEL_URL ?? config.ISSUER}/jwks`;
const pool = createPool(config.DATABASE_URL);

const app = createApiApp({
  issuer: config.ISSUER,
  audience: config.API_AUDIENCE,
  jwks: new RemoteJwksSource(jwksUrl, (input, init) => fetch(input, init), systemClock),
  identity: new PgIdentityReader(pool),
  projects: new PgProjectRepository(pool),
  clock: systemClock,
  logger,
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info("api-server listening", { port: info.port, audience: config.API_AUDIENCE });
});
