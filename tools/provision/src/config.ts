import { z } from "zod";
import { jsonArrayEnv, parseEnv, publicSchemeEnv } from "@sandbox/shared";

const serviceSchema = z.object({
  clientId: z.string().min(1),
  /** ハッシュが SHA-256 のみなので 32 バイト以上の乱数を要求する。base64url で 43 文字 */
  clientSecret: z.string().min(43),
  name: z.string().min(1),
  /** テナントのサブドメインを除いたホスト。例 crm.example.com */
  baseHost: z.string().min(1),
  apiBaseUrl: z.string().url(),
  /** このサービスの DB へのマスター接続。スキーマ作成とシードに使う */
  databaseUrl: z.string().min(1),
  /** <clientId>_app ロールのパスワード。RDS では Secrets Manager の値 */
  dbPassword: z.string().min(1),
});

const envSchema = z
  .object({
    /** identity DB へのマスター接続 */
    DATABASE_URL: z.string().min(1),
    AUTH_DB_PASSWORD: z.string().min(1),
    PUBLIC_SCHEME: publicSchemeEnv.default("https"),
    SERVICES: jsonArrayEnv(serviceSchema),
    COGNITO_REGION: z.string().min(1).optional(),
    COGNITO_USER_POOL_ID: z.string().min(1).optional(),
    SEED_USER_PASSWORD: z.string().min(1).optional(),
  })
  .transform((env) => ({
    ...env,
    /** 3 つ揃ったときだけ Cognito にユーザーを作る。揃わなければ固定 sub でシードする */
    COGNITO:
      env.COGNITO_REGION !== undefined &&
      env.COGNITO_USER_POOL_ID !== undefined &&
      env.SEED_USER_PASSWORD !== undefined
        ? {
            region: env.COGNITO_REGION,
            userPoolId: env.COGNITO_USER_POOL_ID,
            password: env.SEED_USER_PASSWORD,
          }
        : undefined,
  }));

export type ProvisionConfig = z.infer<typeof envSchema>;
export type ServiceConfig = z.infer<typeof serviceSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ProvisionConfig {
  return parseEnv("provision", envSchema, env);
}
