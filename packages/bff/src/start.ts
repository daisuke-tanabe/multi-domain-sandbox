import { serve } from "@hono/node-server";
import { OidcProvider, type OidcClientDeps } from "@sandbox/oidc-client";
import { createLogger, createStoreFactory, nodeFetch, systemClock } from "@sandbox/shared";
import { createBffApp } from "./app.ts";
import { createClientResolvers, loadBffConfig } from "./config.ts";

/**
 * サービスの Web を起動する。apps/<service>-web/src/main.ts はこれを呼ぶだけ。
 */
export function startBff(component: string): void {
  const logger = createLogger(component);
  const config = loadBffConfig(component);
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
    sessions: store(`${prefix}:sess`),
    sessionsBySid: store(`${prefix}:sid`),
    preAuth: store(`${prefix}:pre`),
    clock: systemClock,
    cookiePolicy: { secure: config.cookieSecure },
    logger,
    fetch: nodeFetch,
  };
  const provider = new OidcProvider(deps.provider, deps.fetch, systemClock);
  const app = createBffApp({ deps, provider });

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info(`${component} listening`, {
      port: info.port,
      host: `<tenant>.${config.baseHost}`,
      api: config.service.apiBaseUrl,
    });
  });
}
