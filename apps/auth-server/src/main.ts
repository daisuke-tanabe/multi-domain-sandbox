import { serve } from "@hono/node-server";
import {
  createLogger,
  generateSigningKey,
  importSigningKeyFromPem,
  parseEncryptionKey,
  systemClock,
} from "@sandbox/shared";
import { MockCognitoAuthenticator } from "./adapters/mock-cognito.ts";
import { createMemoryStores } from "./adapters/memory-stores.ts";
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

const deps: AuthDeps = {
  issuer: config.ISSUER,
  apiAudience: config.API_AUDIENCE,
  clock: systemClock,
  stores: createMemoryStores(systemClock),
  identity: new PgIdentityRepository(createPool(config.DATABASE_URL)),
  cognito: new MockCognitoAuthenticator(config.MOCK_COGNITO_USERS, systemClock),
  signingKey,
  encryptionKeys: [encryptionKey.value],
  logger,
};

const app = createAuthApp({ deps, cookiePolicy: { secure: config.COOKIE_SECURE } });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info("auth-server listening", {
    port: info.port,
    issuer: config.ISSUER,
    kid: signingKey.kid,
  });
});
