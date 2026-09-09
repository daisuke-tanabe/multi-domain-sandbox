import { err, ok, type Result } from "@sandbox/shared";
import type { OidcProvider } from "./provider.ts";
import { destroySession, saveSession } from "./session.ts";
import {
  ACCESS_TOKEN_REFRESH_MARGIN_SECONDS,
  type OidcClientConfig,
  type OidcClientDeps,
  type TenantSession,
} from "./types.ts";

export type ApiAccessError =
  | { readonly kind: "session_expired" }
  | { readonly kind: "provider_unavailable"; readonly reason: string };

/**
 * Access Token の残り寿命が短ければ Refresh してからセッションを更新する。
 * invalid_grant ならセッションを破棄し、呼び出し側は再ログインへ誘導する。
 */
export async function ensureFreshAccessToken(
  deps: OidcClientDeps,
  provider: OidcProvider,
  client: OidcClientConfig,
  session: TenantSession,
): Promise<Result<TenantSession, ApiAccessError>> {
  const now = deps.clock.nowSeconds();
  if (session.accessTokenExpiresAt - now > ACCESS_TOKEN_REFRESH_MARGIN_SECONDS) return ok(session);

  const refreshed = await provider.refresh(client, session.refreshToken);
  if (!refreshed.ok) {
    if (refreshed.error.kind === "invalid_grant") {
      deps.logger.info("refresh rejected, destroying tenant session", {
        tenantSlug: session.tenantSlug,
      });
      await destroySession(deps, session);
      return err({ kind: "session_expired" });
    }
    return err({ kind: "provider_unavailable", reason: refreshed.error.kind });
  }
  const updated = await saveSession(deps, {
    ...session,
    accessToken: refreshed.value.access_token,
    accessTokenExpiresAt: now + refreshed.value.expires_in,
    refreshToken: refreshed.value.refresh_token,
  });
  return ok(updated);
}

/**
 * Bearer を付けて API を呼ぶ。期限切れ応答なら一度だけ Refresh して再試行する。
 */
export async function apiFetch(
  deps: OidcClientDeps,
  provider: OidcProvider,
  client: OidcClientConfig,
  session: TenantSession,
  url: string,
  init: RequestInit = {},
): Promise<Result<{ response: Response; session: TenantSession }, ApiAccessError>> {
  const fresh = await ensureFreshAccessToken(deps, provider, client, session);
  if (!fresh.ok) return fresh;

  const response = await deps.fetch(url, withBearer(init, fresh.value.accessToken));
  if (response.status !== 401 || !isExpiredTokenResponse(response)) {
    return ok({ response, session: fresh.value });
  }

  const forced = await ensureFreshAccessToken(deps, provider, client, {
    ...fresh.value,
    accessTokenExpiresAt: 0,
  });
  if (!forced.ok) return forced;
  const retried = await deps.fetch(url, withBearer(init, forced.value.accessToken));
  return ok({ response: retried, session: forced.value });
}

function withBearer(init: RequestInit, accessToken: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return { ...init, headers };
}

function isExpiredTokenResponse(response: Response): boolean {
  const challenge = response.headers.get("WWW-Authenticate") ?? "";
  return challenge.includes("expired");
}
