import { z } from "zod";
import type { OidcClientConfig, ServiceConfig } from "@sandbox/oidc-client";
import { envBoolean, parseEnv, publicSchemeEnv, TENANT_SLUG_PATTERN } from "@sandbox/shared";

const DEFAULT_SCOPES: ReadonlyArray<string> = ["openid", "profile", "email"];

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive(),
    PUBLIC_SCHEME: publicSchemeEnv.default("http"),
    ISSUER: z.string().url(),
    AUTH_BACKCHANNEL_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    COOKIE_SECURE: envBoolean(),
    /** このプロセスが担当するサービス。1 プロセス 1 サービス */
    CLIENT_ID: z.string().regex(TENANT_SLUG_PATTERN),
    CLIENT_SECRET: z.string().min(1),
    SERVICE_NAME: z.string().min(1),
    /** テナントのサブドメインを除いたホスト。例 crm.localhost:3001、crm.example.com */
    BASE_HOST: z.string().min(1),
    API_BASE_URL: z.string().url(),
  })
  .transform((env): ServiceWebConfig => ({
    port: env.PORT,
    publicScheme: env.PUBLIC_SCHEME,
    issuer: env.ISSUER,
    authBackchannelUrl: env.AUTH_BACKCHANNEL_URL,
    redisUrl: env.REDIS_URL,
    cookieSecure: env.COOKIE_SECURE,
    baseHost: env.BASE_HOST.toLowerCase(),
    service: {
      clientId: env.CLIENT_ID,
      clientSecret: env.CLIENT_SECRET,
      scopes: [...DEFAULT_SCOPES],
      apiBaseUrl: env.API_BASE_URL,
      name: env.SERVICE_NAME,
    },
  }));

export interface ServiceWebConfig {
  readonly port: number;
  readonly publicScheme: "http" | "https";
  readonly issuer: string;
  readonly authBackchannelUrl: string | undefined;
  readonly redisUrl: string | undefined;
  readonly cookieSecure: boolean;
  readonly baseHost: string;
  readonly service: ServiceConfig;
}

export function loadServiceWebConfig(
  component: string,
  env: NodeJS.ProcessEnv = process.env,
): ServiceWebConfig {
  return parseEnv(component, envSchema, env);
}

export interface ClientResolvers {
  readonly resolveClient: (host: string | undefined) => OidcClientConfig | undefined;
  readonly resolveClientById: (clientId: string) => ServiceConfig | undefined;
}

/**
 * Host ヘッダからテナントを解決する。
 * <tenant>.<baseHost> に一致するホストのみ受け付け、先頭ラベルをテナント slug とする。
 * 例 tanaka.crm.localhost:3001 → service crm, tenant tanaka
 */
export function createClientResolvers(
  config: Pick<ServiceWebConfig, "publicScheme" | "baseHost" | "service">,
): ClientResolvers {
  const suffix = `.${config.baseHost.toLowerCase()}`;
  return {
    resolveClient: (host) => {
      if (host === undefined) return undefined;
      const lower = host.toLowerCase();
      if (!lower.endsWith(suffix)) return undefined;
      const slug = lower.slice(0, -suffix.length);
      if (!TENANT_SLUG_PATTERN.test(slug)) return undefined;
      return {
        ...config.service,
        tenantSlug: slug,
        redirectUri: `${config.publicScheme}://${lower}/auth/callback`,
      };
    },
    resolveClientById: (clientId) =>
      clientId === config.service.clientId ? config.service : undefined,
  };
}
