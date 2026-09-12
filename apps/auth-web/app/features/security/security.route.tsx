import { sessionsResponseSchema, type Session, type SessionsResponse } from "@sandbox/api-contract";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@sandbox/web-ui";
import { getJson, loadOrLogin } from "../../lib/api.ts";
import type { Route } from "./+types/security.route";

/**
 * セキュリティ。ログイン中のセッションの一覧と、他の端末の失効。
 * 失効はフォーム POST で auth-api に送り、auth-api がここへ戻す
 */
export function clientLoader(): Promise<SessionsResponse> {
  return loadOrLogin(() => getJson(sessionsResponseSchema, "/api/sessions"));
}

function formatTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString("ja-JP");
}

function SessionCard({ session, csrfToken }: { session: Session; csrfToken: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {session.ip}
          {session.current && <Badge>この端末</Badge>}
        </CardTitle>
        <CardDescription className="break-all">{session.user_agent}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          ログイン {formatTime(session.created_at)} / 最終アクセス{" "}
          {formatTime(session.last_seen_at)}
        </p>
        {session.services.length === 0 ? (
          <p className="text-muted-foreground">まだどのサービスにも入っていない</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {session.services.map((service) => (
              <li key={`${service.client_id}:${service.tenant_slug}`}>
                <Badge variant="secondary">
                  {service.name} / {service.tenant_name}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {!session.current && (
        <CardFooter>
          <form method="post" action="/sessions/revoke">
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="session_id" value={session.id} />
            <Button type="submit" variant="destructive" size="sm">
              このセッションを失効する
            </Button>
          </form>
        </CardFooter>
      )}
    </Card>
  );
}

export default function Security({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">セキュリティ</h1>
        <p className="text-sm text-muted-foreground">
          多要素認証の登録状況とログイン中のセッション。見覚えのない端末があれば失効する。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>多要素認証</CardTitle>
          <CardDescription>ログインのたびに認証アプリのコードを求める。</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {loaderData.mfa_methods.map((method) => (
              <li key={method.method} className="flex items-center gap-2">
                <Badge variant="secondary">認証アプリ</Badge>
                <span className="text-muted-foreground">
                  {formatTime(method.enrolled_at)} に登録
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <h2 className="text-lg font-medium">ログイン中のセッション</h2>
        {loaderData.sessions.map((session) => (
          <SessionCard key={session.id} session={session} csrfToken={loaderData.csrfToken} />
        ))}
      </div>
      <Button asChild variant="outline">
        <a href="/">ポータルへ戻る</a>
      </Button>
    </div>
  );
}
