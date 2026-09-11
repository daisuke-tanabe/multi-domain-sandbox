import { z } from "zod";
import { envBoolean, jsonArrayEnv, parseEnv } from "@sandbox/shared";

const mockUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
});

const baseSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  ISSUER: z.string().url(),
  COOKIE_SECURE: envBoolean(),
  DATABASE_URL: z.string().min(1),
  TOKEN_ENCRYPTION_KEY_ID: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  SIGNING_KEY_PEM: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
});

/** COGNITO_ADAPTER で必要な変数が変わる。sdk のときだけ接続情報を必須にする */
const cognitoSchema = z.discriminatedUnion("COGNITO_ADAPTER", [
  z.object({
    COGNITO_ADAPTER: z.literal("mock"),
    MOCK_COGNITO_USERS: jsonArrayEnv(mockUserSchema).default([]),
  }),
  z.object({
    COGNITO_ADAPTER: z.literal("sdk"),
    COGNITO_REGION: z.string().min(1),
    COGNITO_USER_POOL_ID: z.string().min(1),
    COGNITO_CLIENT_ID: z.string().min(1),
    COGNITO_CLIENT_SECRET: z.string().min(1),
  }),
]);

// 未指定なら mock。discriminatedUnion は判別キーの default を持てないため前段で補う
const configSchema = z.preprocess(
  (raw) => ({ COGNITO_ADAPTER: "mock", ...(typeof raw === "object" && raw !== null ? raw : {}) }),
  z.intersection(baseSchema, cognitoSchema),
);

export type AuthServerConfig = z.infer<typeof configSchema>;
export type MockCognitoUser = z.infer<typeof mockUserSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AuthServerConfig {
  return parseEnv("auth-api", configSchema, env);
}
