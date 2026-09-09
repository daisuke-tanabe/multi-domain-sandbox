import { z } from "zod";
import type { OidcClientConfig } from "@sandbox/oidc-client";

const tenantClientSchema = z.object({
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  clientSecret: z.string().min(1),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_SCHEME: z.enum(["http", "https"]).default("http"),
  PUBLIC_BASE_HOST: z.string().min(1),
  ISSUER: z.string().url(),
  AUTH_BACKCHANNEL_URL: z.string().url().optional(),
  API_BACKCHANNEL_URL: z.string().url(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  TENANT_CLIENTS: z.string().transform((value, ctx) => {
    const parsed = z.array(tenantClientSchema).safeParse(JSON.parse(value));
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "TENANT_CLIENTS must be a JSON array" });
      return z.NEVER;
    }
    return parsed.data;
  }),
});

export type TenantWebConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): TenantWebConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid tenant-web configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return parsed.data;
}

const DEFAULT_SCOPES = ["openid", "profile", "email"] as const;

/**
 * Host ヘッダから Client 設定を解決する関数を作る。
 * <slug>.<PUBLIC_BASE_HOST> に完全一致するホストのみ受け付ける。
 */
export function createClientResolver(
  config: Pick<TenantWebConfig, "PUBLIC_SCHEME" | "PUBLIC_BASE_HOST" | "TENANT_CLIENTS">,
): (host: string | undefined) => OidcClientConfig | undefined {
  const byHost = new Map<string, OidcClientConfig>(
    config.TENANT_CLIENTS.map((tenant) => {
      const host = `${tenant.slug}.${config.PUBLIC_BASE_HOST}`;
      return [
        host,
        {
          clientId: tenant.slug,
          clientSecret: tenant.clientSecret,
          redirectUri: `${config.PUBLIC_SCHEME}://${host}/auth/callback`,
          scopes: [...DEFAULT_SCOPES],
          tenantSlug: tenant.slug,
        },
      ];
    }),
  );
  return (host) => (host === undefined ? undefined : byHost.get(host.toLowerCase()));
}
