import type { Context, MiddlewareHandler } from "hono";
import { clearSessionCookie, readSessionCookie } from "./cookies.ts";
import { loadSession, touchSession } from "./session.ts";
import type { OidcClientConfig, OidcClientDeps, TenantSession } from "./types.ts";

/**
 * ハンドラから c.get で参照するリクエストスコープの値。
 */
export type OidcVariables = {
  tenantClient: OidcClientConfig;
  tenantSession: TenantSession | undefined;
};

export type OidcEnv = { Variables: OidcVariables };

/**
 * Host から Client を解決し、セッションがあれば読み込む。未ログインでも通す。
 * Back-Channel Logout のようにテナントのホストで届かない経路は、この前に mount する。
 */
export function tenantContext(
  deps: OidcClientDeps,
  onUnknownHost: (c: Context) => Response | Promise<Response>,
): MiddlewareHandler<OidcEnv> {
  return async (c, next) => {
    const client = deps.resolveClient(c.req.header("host"));
    if (client === undefined) return onUnknownHost(c);
    c.set("tenantClient", client);

    const cookieValue = readSessionCookie(c, deps);
    const session = await loadSession(deps, client, cookieValue);
    if (session === undefined && cookieValue !== undefined) clearSessionCookie(c, deps);
    c.set("tenantSession", session === undefined ? undefined : await touchSession(deps, session));
    await next();
  };
}

/**
 * 未ログインなら /auth/login へ送る。戻り先は自ドメイン内のパスに限定する。
 */
export function requireSession(): MiddlewareHandler<OidcEnv> {
  return async (c, next) => {
    if (c.get("tenantSession") === undefined) {
      const returnTo = encodeURIComponent(c.req.path);
      return c.redirect(`/auth/login?return_to=${returnTo}`);
    }
    await next();
  };
}
