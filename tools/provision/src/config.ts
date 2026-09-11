import { z } from "zod";

const serviceSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  name: z.string().min(1),
  /** テナントのサブドメインを除いたホスト。例 crm.example.com */
  baseHost: z.string().min(1),
  apiBaseUrl: z.string().url(),
});

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_DB_PASSWORD: z.string().min(1),
  API_DB_PASSWORD: z.string().min(1),
  PUBLIC_SCHEME: z.enum(["http", "https"]).default("https"),
  SERVICES: z.string().transform((value, ctx) => {
    const parsed = z.array(serviceSchema).safeParse(JSON.parse(value));
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "SERVICES must be a JSON array" });
      return z.NEVER;
    }
    return parsed.data;
  }),
  COGNITO_REGION: z.string().optional(),
  COGNITO_USER_POOL_ID: z.string().optional(),
  SEED_USER_PASSWORD: z.string().optional(),
});

export type ProvisionConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ProvisionConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid provision configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return parsed.data;
}
