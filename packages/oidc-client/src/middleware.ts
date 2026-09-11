import type { Context, MiddlewareHandler } from "hono";
import { clearSessionCookie, readSessionCookie } from "./routes.ts";
import { loadSession, saveSession } from "./session.ts";
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
 */
export function tenantContext(
  deps: OidcClientDeps,
  onUnknownHost: (c: Context) => Response | Promise<Response>,
): MiddlewareHandler<OidcEnv> {
  return async (c, next) => {
    // Back-Channel Logout はサーバー間通信で Host がテナントのホストにならないため、ここでは解決しない
    if (c.req.path === "/auth/backchannel-logout") {
      await next();
      return;
    }
    const client = deps.resolveClient(c.req.header("host"));
    if (client === undefined) return onUnknownHost(c);
    c.set("tenantClient", client);

    const cookieValue = readSessionCookie(c, deps);
    const session = await loadSession(deps, client, cookieValue);
    if (session === undefined && cookieValue !== undefined) clearSessionCookie(c, deps);
    c.set("tenantSession", session === undefined ? undefined : await saveSession(deps, session));
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
