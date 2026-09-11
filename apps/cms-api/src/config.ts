import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3004),
  /** この API の公開ホスト。aud は <PUBLIC_SCHEME>://<API_HOST> になり、oidc_clients.audience と一致させる */
  API_HOST: z
    .string()
    .min(1)
    .transform((value) => value.toLowerCase()),
  PUBLIC_SCHEME: z.enum(["http", "https"]).default("http"),
  ISSUER: z.string().url(),
  AUTH_BACKCHANNEL_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
});

export type CmsApiConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CmsApiConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid cms-api configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return parsed.data;
}
