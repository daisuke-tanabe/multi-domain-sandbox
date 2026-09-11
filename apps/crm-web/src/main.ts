import { serve } from "@hono/node-server";
import { OidcProvider, type OidcClientDeps } from "@sandbox/oidc-client";
import {
  createClientResolvers,
  createServiceWebApp,
  loadServiceWebConfig,
  toServiceEntry,
} from "@sandbox/service-web";
import {
  createLogger,
  createRedisClient,
  MemoryKeyValueStore,
  RedisKeyValueStore,
  systemClock,
  type KeyValueStore,
} from "@sandbox/shared";

const logger = createLogger("crm-web");
const config = loadServiceWebConfig();
const service = toServiceEntry(config);

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
  ...createClientResolvers({ publicScheme: config.PUBLIC_SCHEME, service }),
  sessions: createStore(`${service.clientId}:sess`),
  sessionsBySid: createStore(`${service.clientId}:sid`),
  preAuth: createStore(`${service.clientId}:pre`),
  clock: systemClock,
  cookiePolicy: { secure: config.COOKIE_SECURE },
  logger,
  fetch: (input, init) => fetch(input, init),
};

const provider = new OidcProvider(deps.provider, deps.fetch, systemClock);
const app = createServiceWebApp({ deps, provider });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info("crm-web listening", {
    port: info.port,
    host: `<tenant>.${service.baseHost}`,
    api: service.apiBaseUrl,
  });
});
