import { logoutResponseSchema, type LogoutResponse } from "@sandbox/api-contract";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@sandbox/web-ui";
import { getJson, pickQuery } from "../../lib/api.ts";
import type { Route } from "./+types/logout.route";

/**
 * Global Logout。/logout?client_id=&tenant=。
 * SSO Session があれば確認フォーム、なければ完了画面。POST 後は auth-api がここへ戻す。
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs): Promise<LogoutResponse> {
  const params = pickQuery(request.url, ["client_id", "tenant"]);
  return getJson(logoutResponseSchema, `/api/logout?${params.toString()}`);
}

export default function Logout({ loaderData }: Route.ComponentProps) {
  const query = new URLSearchParams(window.location.search);
  if (!loaderData.authenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sandbox からログアウトしました</CardTitle>
          <CardDescription>すべてのテナントのセッションを無効化した。</CardDescription>
        </CardHeader>
        {loaderData.returnTo !== undefined && (
          <CardContent>
            <Button asChild variant="outline">
              <a href={loaderData.returnTo.href}>{loaderData.returnTo.label} に戻る</a>
            </Button>
          </CardContent>
        )}
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sandbox 全体からログアウトしますか</CardTitle>
        <CardDescription>
          SSO Session を破棄し、ログイン済みのすべてのテナントからログアウトする。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" action="/logout">
          <input type="hidden" name="csrf" value={loaderData.csrfToken ?? ""} />
          {query.has("client_id") && (
            <input type="hidden" name="client_id" value={query.get("client_id") ?? ""} />
          )}
          {query.has("tenant") && (
            <input type="hidden" name="tenant" value={query.get("tenant") ?? ""} />
          )}
          <Button type="submit" variant="destructive">
            ログアウトする
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
