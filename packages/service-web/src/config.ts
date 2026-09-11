import { z } from "zod";
import type { OidcClientConfig, ServiceConfig } from "@sandbox/oidc-client";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  PUBLIC_SCHEME: z.enum(["http", "https"]).default("http"),
  ISSUER: z.string().url(),
  AUTH_BACKCHANNEL_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /** このプロセスが担当するサービス。1 プロセス 1 サービス */
  CLIENT_ID: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  CLIENT_SECRET: z.string().min(1),
  SERVICE_NAME: z.string().min(1),
  /** テナントのサブドメインを除いたホスト。例 crm.localhost:3001、crm.example.com */
  BASE_HOST: z.string().min(1),
  API_BASE_URL: z.string().url(),
});

export type ServiceWebConfig = z.infer<typeof envSchema>;

export interface ServiceEntry {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly name: string;
  readonly baseHost: string;
  readonly apiBaseUrl: string;
}

export function loadServiceWebConfig(env: NodeJS.ProcessEnv = process.env): ServiceWebConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid service-web configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return parsed.data;
}

export function toServiceEntry(config: ServiceWebConfig): ServiceEntry {
  return {
    clientId: config.CLIENT_ID,
    clientSecret: config.CLIENT_SECRET,
    name: config.SERVICE_NAME,
    baseHost: config.BASE_HOST,
    apiBaseUrl: config.API_BASE_URL,
  };
}

const DEFAULT_SCOPES = ["openid", "profile", "email"] as const;
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface ClientResolvers {
  readonly resolveClient: (host: string | undefined) => OidcClientConfig | undefined;
  readonly resolveClientById: (clientId: string) => ServiceConfig | undefined;
}

/**
 * Host ヘッダからテナントを解決する。
 * <tenant>.<baseHost> に一致するホストのみ受け付け、先頭ラベルをテナント slug とする。
 * 例 tanaka.crm.localhost:3001 → service crm, tenant tanaka
 */
export function createClientResolvers(input: {
  readonly publicScheme: "http" | "https";
  readonly service: ServiceEntry;
}): ClientResolvers {
  const service: ServiceConfig = {
    clientId: input.service.clientId,
    clientSecret: input.service.clientSecret,
    scopes: [...DEFAULT_SCOPES],
    apiBaseUrl: input.service.apiBaseUrl,
    name: input.service.name,
  };
  const suffix = `.${input.service.baseHost.toLowerCase()}`;

  return {
    resolveClient: (host) => {
      if (host === undefined) return undefined;
      const lower = host.toLowerCase();
      if (!lower.endsWith(suffix)) return undefined;
      const slug = lower.slice(0, -suffix.length);
      if (!TENANT_SLUG_PATTERN.test(slug)) return undefined;
      return {
        ...service,
        tenantSlug: slug,
        redirectUri: `${input.publicScheme}://${lower}/auth/callback`,
      };
    },
    resolveClientById: (clientId) => (clientId === service.clientId ? service : undefined),
  };
}
