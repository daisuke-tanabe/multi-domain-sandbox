import { z } from "zod";
import { parseEnv, TENANT_SLUG_PATTERN } from "@sandbox/shared";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  /** この API の公開 URL。そのまま Access Token の aud になり、oidc_clients.audience と一致させる */
  API_BASE_URL: z.string().url(),
  ISSUER: z.string().url(),
  AUTH_BACKCHANNEL_URL: z.string().url().optional(),
  /** 自分のサービスの DB。identity DB ではない */
  DATABASE_URL: z.string().min(1),
  /** auth-api の管理 API を呼ぶための Client 認証。*-web と同じ値 */
  CLIENT_ID: z.string().regex(TENANT_SLUG_PATTERN),
  CLIENT_SECRET: z.string().min(43),
});

export type ApiCoreConfig = z.infer<typeof envSchema>;

export function loadApiCoreConfig(
  component: string,
  env: NodeJS.ProcessEnv = process.env,
): ApiCoreConfig {
  return parseEnv(component, envSchema, env);
}
