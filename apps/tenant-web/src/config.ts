import { z } from "zod";
import type { OidcClientConfig, ServiceConfig } from "@sandbox/oidc-client";

const serviceSchema = z.object({
  clientId: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  clientSecret: z.string().min(1),
  name: z.string().min(1),
  /** テナントのサブドメインを除いたホスト。例 crm.localhost:3001、crm.example.com */
  baseHost: z.string().min(1),
  apiBaseUrl: z.string().url(),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_SCHEME: z.enum(["http", "https"]).default("http"),
  ISSUER: z.string().url(),
  AUTH_BACKCHANNEL_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SERVICES: z.string().transform((value, ctx) => {
    const parsed = z.array(serviceSchema).safeParse(JSON.parse(value));
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "SERVICES must be a JSON array" });
      return z.NEVER;
    }
    return parsed.data;
  }),
});

export type TenantWebConfig = z.infer<typeof envSchema>;
export type ServiceEntry = z.infer<typeof serviceSchema>;

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
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface ClientResolvers {
  readonly resolveClient: (host: string | undefined) => OidcClientConfig | undefined;
  readonly resolveClientById: (clientId: string) => ServiceConfig | undefined;
}

/**
 * Host ヘッダからサービスとテナントを解決する。
 * <tenant>.<baseHost> に一致するホストのみ受け付け、先頭ラベルをテナント slug とする。
 * 例 tanaka.crm.localhost:3001 → service crm, tenant tanaka
 */
export function createClientResolvers(
  config: Pick<TenantWebConfig, "PUBLIC_SCHEME" | "SERVICES">,
): ClientResolvers {
  const services = config.SERVICES.map((entry) => {
    const service: ServiceConfig = {
      clientId: entry.clientId,
      clientSecret: entry.clientSecret,
      scopes: [...DEFAULT_SCOPES],
      apiBaseUrl: entry.apiBaseUrl,
      name: entry.name,
    };
    return { baseHost: entry.baseHost.toLowerCase(), service };
  });
  const byId = new Map(services.map(({ service }) => [service.clientId, service]));

  return {
    resolveClient: (host) => {
      if (host === undefined) return undefined;
      const lower = host.toLowerCase();
      for (const { baseHost, service } of services) {
        const suffix = `.${baseHost}`;
        if (!lower.endsWith(suffix)) continue;
        const slug = lower.slice(0, -suffix.length);
        if (!TENANT_SLUG_PATTERN.test(slug)) continue;
        return {
          ...service,
          tenantSlug: slug,
          redirectUri: `${config.PUBLIC_SCHEME}://${lower}/auth/callback`,
        };
      }
      return undefined;
    },
    resolveClientById: (clientId) => byId.get(clientId),
  };
}
