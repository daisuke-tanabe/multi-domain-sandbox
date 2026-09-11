import { err, isExpiredTokenChallenge, ok, type Result } from "@sandbox/shared";
import type { OidcProvider } from "./provider.ts";
import { destroySession, loadSession, saveSession } from "./session.ts";
import {
  ACCESS_TOKEN_REFRESH_MARGIN_SECONDS,
  REFRESH_LOCK_TTL_SECONDS,
  type OidcClientConfig,
  type OidcClientDeps,
  type TenantSession,
} from "./types.ts";

export type ApiAccessError =
  | { readonly kind: "session_expired" }
  | { readonly kind: "provider_unavailable"; readonly reason: string };

const REFRESH_WAIT_MS = 100;
const REFRESH_WAIT_ATTEMPTS = 30;

function needsRefresh(session: TenantSession, now: number): boolean {
  return session.accessTokenExpiresAt - now <= ACCESS_TOKEN_REFRESH_MARGIN_SECONDS;
}

/**
 * Access Token の残り寿命が短ければ Refresh してからセッションを更新する。
 * 同じセッションで同時に走るリクエストは 1 つだけが Refresh し、他はその結果を待って再読込する。
 * Refresh Token は一回限りなので、二重に送ると Auth Server が再利用とみなし系列ごと失効させる。
 * invalid_grant ならセッションを破棄し、呼び出し側は再ログインへ誘導する。
 */
export async function ensureFreshAccessToken(
  deps: OidcClientDeps,
  provider: OidcProvider,
  client: OidcClientConfig,
  session: TenantSession,
): Promise<Result<TenantSession, ApiAccessError>> {
  if (!needsRefresh(session, deps.clock.nowSeconds())) return ok(session);

  const lockKey = `${client.tenantSlug}:${session.id}`;
  const locked = await deps.refreshLocks.setIfAbsent(lockKey, "1", REFRESH_LOCK_TTL_SECONDS);
  if (!locked) return waitForRefresh(deps, client, session);

  try {
    // ロック取得までに別のリクエストが更新していれば、その結果を使う
    const latest = (await loadSession(deps, client, session.id)) ?? session;
    if (!needsRefresh(latest, deps.clock.nowSeconds())) return ok(latest);
    return await refresh(deps, provider, client, latest);
  } finally {
    await deps.refreshLocks.delete(lockKey);
  }
}

async function refresh(
  deps: OidcClientDeps,
  provider: OidcProvider,
  client: OidcClientConfig,
  session: TenantSession,
): Promise<Result<TenantSession, ApiAccessError>> {
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
  const now = deps.clock.nowSeconds();
  const updated = await saveSession(deps, {
    ...session,
    accessToken: refreshed.value.access_token,
    accessTokenExpiresAt: now + refreshed.value.expires_in,
    refreshToken: refreshed.value.refresh_token,
  });
  return ok(updated);
}

/** 他のリクエストが Refresh 中。完了を待ってセッションを読み直す */
async function waitForRefresh(
  deps: OidcClientDeps,
  client: OidcClientConfig,
  session: TenantSession,
): Promise<Result<TenantSession, ApiAccessError>> {
  for (let attempt = 0; attempt < REFRESH_WAIT_ATTEMPTS; attempt += 1) {
    await deps.sleep(REFRESH_WAIT_MS);
    const latest = await loadSession(deps, client, session.id);
    if (latest === undefined) return err({ kind: "session_expired" });
    if (!needsRefresh(latest, deps.clock.nowSeconds())) return ok(latest);
  }
  return err({ kind: "provider_unavailable", reason: "refresh_lock_timeout" });
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
  if (
    response.status !== 401 ||
    !isExpiredTokenChallenge(response.headers.get("WWW-Authenticate"))
  ) {
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
