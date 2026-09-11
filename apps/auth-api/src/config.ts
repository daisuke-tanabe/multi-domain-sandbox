import { z } from "zod";
import { jsonArrayEnv, parseEnv } from "@sandbox/shared";

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
const configSchema = z
  .preprocess(
    (raw) => ({ COGNITO_ADAPTER: "mock", ...(typeof raw === "object" && raw !== null ? raw : {}) }),
    z.intersection(baseSchema, cognitoSchema),
  )
  .transform((env) => ({
    ...env,
    /** Cookie の Secure と __Host- は issuer の scheme から決める。別の変数で外せる状態を作らない */
    cookieSecure: env.ISSUER.startsWith("https://"),
  }))
  .superRefine((config, ctx) => {
    // https で公開する構成では、開発用の既定値をそのまま使えないようにする
    if (!config.cookieSecure) return;
    const issues: Array<[string, string]> = [];
    if (config.SIGNING_KEY_PEM === undefined)
      issues.push(["SIGNING_KEY_PEM", "is required when ISSUER is https"]);
    if (config.REDIS_URL === undefined)
      issues.push(["REDIS_URL", "is required when ISSUER is https"]);
    if (config.COGNITO_ADAPTER !== "sdk")
      issues.push(["COGNITO_ADAPTER", "must be sdk when ISSUER is https"]);
    for (const [path, message] of issues) ctx.addIssue({ code: "custom", path: [path], message });
  });

export type AuthServerConfig = z.infer<typeof configSchema>;
export type MockCognitoUser = z.infer<typeof mockUserSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AuthServerConfig {
  return parseEnv("auth-api", configSchema, env);
}
