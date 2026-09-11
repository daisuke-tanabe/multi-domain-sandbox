import { serve } from "@hono/node-server";
import { OidcProvider, type OidcClientDeps } from "@sandbox/oidc-client";
import {
  createLogger,
  createRedisClient,
  MemoryKeyValueStore,
  RedisKeyValueStore,
  systemClock,
  type KeyValueStore,
} from "@sandbox/shared";
import { createTenantApp } from "./app.ts";
import { createClientResolvers, loadConfig } from "./config.ts";

const logger = createLogger("tenant-web");
const config = loadConfig();

const redis = config.REDIS_URL === undefined ? undefined : createRedisClient(config.REDIS_URL);
if (redis === undefined) {
  logger.warn("REDIS_URL is not set. Sessions are kept in memory and lost on restart");
}

function createStore<T>(prefix: string): KeyValueStore<T> {
  return redis === undefined
    ? new MemoryKeyValueStore<T>(systemClock)
    : new RedisKeyValueStore<T>(redis, prefix);
}

const deps: OidcClientDeps = {
  provider: {
    issuer: config.ISSUER,
    ...(config.AUTH_BACKCHANNEL_URL !== undefined && {
      backchannelBaseUrl: config.AUTH_BACKCHANNEL_URL,
    }),
  },
  ...createClientResolvers(config),
  sessions: createStore("tenant:sess"),
  sessionsBySid: createStore("tenant:sid"),
  preAuth: createStore("tenant:pre"),
  clock: systemClock,
  cookiePolicy: { secure: config.COOKIE_SECURE },
  logger,
  fetch: (input, init) => fetch(input, init),
};

const provider = new OidcProvider(deps.provider, deps.fetch, systemClock);
const app = createTenantApp({ deps, provider });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info("tenant-web listening", {
    port: info.port,
    services: config.SERVICES.map((service) => `<tenant>.${service.baseHost}`),
  });
});
