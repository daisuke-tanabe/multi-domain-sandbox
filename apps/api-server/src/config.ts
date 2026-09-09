import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
  API_AUDIENCE: z.string().url(),
  ISSUER: z.string().url(),
  AUTH_BACKCHANNEL_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
});

export type ApiServerConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid api-server configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return parsed.data;
}
