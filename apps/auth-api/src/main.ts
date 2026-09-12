import { serve } from "@hono/node-server";
import {
  createLogger,
  createPool,
  createStoreFactory,
  generateSigningKey,
  importSigningKeyFromPem,
  nodeFetch,
  parseEncryptionKey,
  spaOptionsFromEnv,
  systemClock,
} from "@sandbox/shared";
import { SdkCognitoAuthenticator } from "./infrastructure/cognito-sdk.ts";
import { MockCognitoAuthenticator } from "./infrastructure/mock-cognito.ts";
import { PgAuditRepository } from "./infrastructure/pg-audit-repository.ts";
import { PgIdentityRepository } from "./infrastructure/pg-identity-repository.ts";
import { PgSessionRepository } from "./infrastructure/pg-session-repository.ts";
import { createAuthStores } from "./infrastructure/stores.ts";
import { createAuthApp } from "./interface/http/app.ts";
import { loadConfig } from "./config.ts";
import type { AuthDeps } from "./application/deps.ts";

const logger = createLogger("auth-api");
const config = loadConfig();

const encryptionKey = parseEncryptionKey(
  config.TOKEN_ENCRYPTION_KEY_ID,
  config.TOKEN_ENCRYPTION_KEY,
);
if (!encryptionKey.ok) throw new Error("TOKEN_ENCRYPTION_KEY must be base64 of 32 bytes");

const signingKey =
  config.SIGNING_KEY_PEM === undefined
    ? await generateSigningKey()
    : await importSigningKeyFromPem(config.SIGNING_KEY_PEM);
if (config.SIGNING_KEY_PEM === undefined) {
  logger.warn(
    "SIGNING_KEY_PEM is not set. Using an ephemeral signing key; tokens will not survive a restart",
  );
}

function createCognitoAuthenticator() {
  if (config.COGNITO_ADAPTER === "mock") {
    logger.warn("COGNITO_ADAPTER=mock. Cognito is not used");
    return new MockCognitoAuthenticator(config.MOCK_COGNITO_USERS, systemClock);
  }
  return new SdkCognitoAuthenticator(
    {
      region: config.COGNITO_REGION,
      userPoolId: config.COGNITO_USER_POOL_ID,
      clientId: config.COGNITO_CLIENT_ID,
      clientSecret: config.COGNITO_CLIENT_SECRET,
    },
    systemClock,
    logger,
    nodeFetch,
  );
}

const pool = createPool(config.DATABASE_URL, logger);
const deps: AuthDeps = {
  issuer: config.ISSUER,
  clock: systemClock,
  stores: createAuthStores(
    createStoreFactory({ redisUrl: config.REDIS_URL, clock: systemClock, logger }),
  ),
  identity: new PgIdentityRepository(pool),
  sessions: new PgSessionRepository(pool),
  audit: new PgAuditRepository(pool),
  cognito: createCognitoAuthenticator(),
  signingKey,
  encryptionKeys: [encryptionKey.value],
  logger,
  fetch: nodeFetch,
};

const spa = spaOptionsFromEnv(
  { spaDir: config.SPA_DIR, spaDevServerUrl: config.SPA_DEV_SERVER_URL },
  nodeFetch,
);
if (spa.kind === "none") {
  logger.warn(
    "SPA_DIR and SPA_DEV_SERVER_URL are not set. Login and portal screens are not served",
  );
}
const app = createAuthApp({ deps, cookiePolicy: { secure: config.cookieSecure }, spa });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info("auth-api listening", {
    port: info.port,
    issuer: config.ISSUER,
    kid: signingKey.kid,
    spa: spa.kind,
  });
});
