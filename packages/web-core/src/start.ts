import { serve } from "@hono/node-server";
import { OidcProvider, type OidcClientDeps } from "@sandbox/oidc-client";
import {
  createLogger,
  createStoreFactory,
  nodeFetch,
  spaOptionsFromEnv,
  systemClock,
} from "@sandbox/shared";
import { createWebCoreApp } from "./app.ts";
import { createClientResolvers, loadWebCoreConfig } from "./config.ts";

/**
 * サービスの Web を起動する。apps/<service>-web/src/main.ts はこれを呼ぶだけ。
 */
export function startWebCore(component: string): void {
  const logger = createLogger(component);
  const config = loadWebCoreConfig(component);
  const store = createStoreFactory({ redisUrl: config.redisUrl, clock: systemClock, logger });
  const prefix = config.service.clientId;

  const deps: OidcClientDeps = {
    provider: {
      issuer: config.issuer,
      ...(config.authBackchannelUrl !== undefined && {
        backchannelBaseUrl: config.authBackchannelUrl,
      }),
    },
    ...createClientResolvers(config),
    sessions: store.kv(`${prefix}:sess`),
    sessionsBySid: store.set(`${prefix}:sid`),
    preAuth: store.kv(`${prefix}:pre`),
    refreshLocks: store.kv(`${prefix}:lock`),
    rateLimits: store.counter(`${prefix}:ratelimit`),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    clock: systemClock,
    cookiePolicy: { secure: config.cookieSecure },
    logger,
    fetch: nodeFetch,
  };
  const provider = new OidcProvider(deps.provider, deps.fetch, systemClock);
  const spa = spaOptionsFromEnv(config, nodeFetch);
  if (spa.kind === "none") {
    logger.warn(
      "SPA_DIR and SPA_DEV_SERVER_URL are not set. Only /auth, /session and /api are served",
    );
  }
  const app = createWebCoreApp({ deps, provider, spa });

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info(`${component} listening`, {
      port: info.port,
      host: `<tenant>.${config.baseHost}`,
      api: config.service.apiBaseUrl,
      spa: spa.kind,
    });
  });
}
