import { z } from "zod";

const tenantClientSchema = z.object({
  slug: z.string().min(1),
  clientSecret: z.string().min(1),
});

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_DB_PASSWORD: z.string().min(1),
  API_DB_PASSWORD: z.string().min(1),
  PUBLIC_SCHEME: z.enum(["http", "https"]).default("https"),
  PUBLIC_BASE_HOST: z.string().min(1),
  TENANT_CLIENTS: z.string().transform((value, ctx) => {
    const parsed = z.array(tenantClientSchema).safeParse(JSON.parse(value));
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "TENANT_CLIENTS must be a JSON array" });
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
