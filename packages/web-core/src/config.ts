import { z } from "zod";
import type { OidcClientConfig, ServiceConfig } from "@sandbox/oidc-client";
import { parseEnv, publicSchemeEnv, TENANT_SLUG_PATTERN } from "@sandbox/shared";

const DEFAULT_SCOPES: ReadonlyArray<string> = ["openid", "profile", "email"];

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive(),
    PUBLIC_SCHEME: publicSchemeEnv.default("http"),
    ISSUER: z.string().url(),
    AUTH_BACKCHANNEL_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    /** このプロセスが担当するサービス。1 プロセス 1 サービス */
    CLIENT_ID: z.string().regex(TENANT_SLUG_PATTERN),
    /** ハッシュが SHA-256 のみなので 32 バイト以上の乱数を要求する。base64url で 43 文字 */
    CLIENT_SECRET: z.string().min(43),
    SERVICE_NAME: z.string().min(1),
    /** テナントのサブドメインを除いたホスト。例 crm.localhost:3001、crm.example.com */
    BASE_HOST: z.string().min(1),
    API_BASE_URL: z.string().url(),
  })
  .transform((env): WebCoreConfig => ({
    port: env.PORT,
    publicScheme: env.PUBLIC_SCHEME,
    issuer: env.ISSUER,
    authBackchannelUrl: env.AUTH_BACKCHANNEL_URL,
    redisUrl: env.REDIS_URL,
    // Cookie の Secure と __Host- は公開 scheme から決める。別の変数で外せる状態を作らない
    cookieSecure: env.PUBLIC_SCHEME === "https",
    baseHost: env.BASE_HOST.toLowerCase(),
    service: {
      clientId: env.CLIENT_ID,
      clientSecret: env.CLIENT_SECRET,
      scopes: [...DEFAULT_SCOPES],
      apiBaseUrl: env.API_BASE_URL,
      name: env.SERVICE_NAME,
    },
  }))
  .superRefine((config, ctx) => {
    // https で公開する構成では、開発用の既定値をそのまま使えないようにする
    if (!config.cookieSecure) return;
    const issues: Array<[string, string]> = [];
    if (config.redisUrl === undefined) issues.push(["REDIS_URL", "is required"]);
    if (!config.issuer.startsWith("https://")) issues.push(["ISSUER", "must be https"]);
    if (!config.service.apiBaseUrl.startsWith("https://"))
      issues.push(["API_BASE_URL", "must be https"]);
    for (const [path, message] of issues) {
      ctx.addIssue({
        code: "custom",
        path: [path],
        message: `${message} when PUBLIC_SCHEME is https`,
      });
    }
  });

export interface WebCoreConfig {
  readonly port: number;
  readonly publicScheme: "http" | "https";
  readonly issuer: string;
  readonly authBackchannelUrl: string | undefined;
  readonly redisUrl: string | undefined;
  readonly cookieSecure: boolean;
  readonly baseHost: string;
  readonly service: ServiceConfig;
}

export function loadWebCoreConfig(
  component: string,
  env: NodeJS.ProcessEnv = process.env,
): WebCoreConfig {
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
  config: Pick<WebCoreConfig, "publicScheme" | "baseHost" | "service">,
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
