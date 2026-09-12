import { logoutResponseSchema, type LogoutResponse } from "@sandbox/api-contract";
import { getJson } from "../api.ts";
import type { Route } from "./+types/logout";

/**
 * Global Logout。/logout?client_id=&tenant=。
 * SSO Session があれば確認フォーム、なければ完了画面。POST 後は auth-api がここへ戻す。
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs): Promise<LogoutResponse> {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["client_id", "tenant"]) {
    const value = url.searchParams.get(key);
    if (value !== null) params.set(key, value);
  }
  return getJson(logoutResponseSchema, `/api/logout?${params.toString()}`);
}

export default function Logout({ loaderData, params: _params }: Route.ComponentProps) {
  const query = new URLSearchParams(window.location.search);
  if (!loaderData.authenticated) {
    return (
      <>
        <h1>Sandbox からログアウトしました</h1>
        <p className="muted">すべてのテナントのセッションを無効化しました。</p>
        {loaderData.returnTo !== undefined && (
          <p>
            <a href={loaderData.returnTo.href}>{loaderData.returnTo.label} に戻る</a>
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <h1>Sandbox 全体からログアウトしますか</h1>
      <p className="muted">
        SSO Session を破棄し、ログイン済みのすべてのテナントからログアウトします。
      </p>
      <form method="post" action="/logout">
        <input type="hidden" name="csrf" value={loaderData.csrfToken ?? ""} />
        {query.has("client_id") && (
          <input type="hidden" name="client_id" value={query.get("client_id") ?? ""} />
        )}
        {query.has("tenant") && (
          <input type="hidden" name="tenant" value={query.get("tenant") ?? ""} />
        )}
        <button type="submit">ログアウトする</button>
      </form>
    </>
  );
}
