import { serve } from "@hono/node-server";
import { OidcProvider, type OidcClientDeps } from "@sandbox/oidc-client";
import { createLogger, MemoryKeyValueStore, systemClock } from "@sandbox/shared";
import { createTenantApp } from "./app.ts";
import { createClientResolver, loadConfig } from "./config.ts";

const logger = createLogger("tenant-web");
const config = loadConfig();

const deps: OidcClientDeps = {
  provider: {
    issuer: config.ISSUER,
    ...(config.AUTH_BACKCHANNEL_URL !== undefined && {
      backchannelBaseUrl: config.AUTH_BACKCHANNEL_URL,
    }),
  },
  resolveClient: createClientResolver(config),
  sessions: new MemoryKeyValueStore(systemClock),
  preAuth: new MemoryKeyValueStore(systemClock),
  clock: systemClock,
  cookiePolicy: { secure: config.COOKIE_SECURE },
  logger,
  fetch: (input, init) => fetch(input, init),
};

const provider = new OidcProvider(deps.provider, deps.fetch, systemClock);
const app = createTenantApp({ deps, provider, apiBaseUrl: config.API_BACKCHANNEL_URL });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info("tenant-web listening", {
    port: info.port,
    hosts: config.TENANT_CLIENTS.map((tenant) => `${tenant.slug}.${config.PUBLIC_BASE_HOST}`),
  });
});
