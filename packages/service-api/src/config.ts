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

export type ServiceApiConfig = z.infer<typeof envSchema>;

export function loadServiceApiConfig(
  component: string,
  env: NodeJS.ProcessEnv = process.env,
): ServiceApiConfig {
  return parseEnv(component, envSchema, env);
}
