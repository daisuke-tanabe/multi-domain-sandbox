import { serve } from "@hono/node-server";
import {
  createLogger,
  createRedisClient,
  generateSigningKey,
  importSigningKeyFromPem,
  parseEncryptionKey,
  systemClock,
} from "@sandbox/shared";
import { SdkCognitoAuthenticator } from "./adapters/cognito-sdk.ts";
import { MockCognitoAuthenticator } from "./adapters/mock-cognito.ts";
import { createMemoryStores } from "./adapters/memory-stores.ts";
import { createRedisStores } from "./adapters/redis-stores.ts";
import { createPool, PgIdentityRepository } from "./adapters/pg-identity-repository.ts";
import { createAuthApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import type { AuthDeps } from "./usecases/deps.ts";

const logger = createLogger("auth-server");
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
      region: config.COGNITO_REGION ?? "",
      userPoolId: config.COGNITO_USER_POOL_ID ?? "",
      clientId: config.COGNITO_CLIENT_ID ?? "",
      clientSecret: config.COGNITO_CLIENT_SECRET ?? "",
    },
    systemClock,
    logger,
    (input, init) => fetch(input, init),
  );
}

if (config.REDIS_URL === undefined) {
  logger.warn("REDIS_URL is not set. Sessions are kept in memory and lost on restart");
}

const deps: AuthDeps = {
  issuer: config.ISSUER,
  clock: systemClock,
  stores:
    config.REDIS_URL === undefined
      ? createMemoryStores(systemClock)
      : createRedisStores(createRedisClient(config.REDIS_URL)),
  identity: new PgIdentityRepository(
    createPool(config.DATABASE_URL, (error) =>
      logger.error("database pool error", { message: error.message }),
    ),
  ),
  cognito: createCognitoAuthenticator(),
  signingKey,
  encryptionKeys: [encryptionKey.value],
  logger,
  fetch: (input, init) => fetch(input, init),
};

const app = createAuthApp({ deps, cookiePolicy: { secure: config.COOKIE_SECURE } });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info("auth-server listening", {
    port: info.port,
    issuer: config.ISSUER,
    kid: signingKey.kid,
  });
});
