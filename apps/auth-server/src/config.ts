import { z } from "zod";

const mockUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  ISSUER: z.string().url(),
  API_AUDIENCE: z.string().url(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DATABASE_URL: z.string().min(1),
  TOKEN_ENCRYPTION_KEY_ID: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  SIGNING_KEY_PEM: z.string().optional(),
  COGNITO_ADAPTER: z.enum(["mock"]).default("mock"),
  MOCK_COGNITO_USERS: z
    .string()
    .default("[]")
    .transform((value, ctx) => {
      const parsed = z.array(mockUserSchema).safeParse(JSON.parse(value));
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: "MOCK_COGNITO_USERS must be a JSON array of users",
        });
        return z.NEVER;
      }
      return parsed.data;
    }),
});

export type AuthServerConfig = z.infer<typeof envSchema>;
export type MockCognitoUser = z.infer<typeof mockUserSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AuthServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid auth-server configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return parsed.data;
}
