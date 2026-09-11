import { z } from "zod";
import { parseEnv } from "@sandbox/shared";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  /** この API の公開 URL。そのまま Access Token の aud になり、oidc_clients.audience と一致させる */
  API_BASE_URL: z.string().url(),
  ISSUER: z.string().url(),
  AUTH_BACKCHANNEL_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
});

export type ApiCoreConfig = z.infer<typeof envSchema>;

export function loadApiCoreConfig(
  component: string,
  env: NodeJS.ProcessEnv = process.env,
): ApiCoreConfig {
  return parseEnv(component, envSchema, env);
}
