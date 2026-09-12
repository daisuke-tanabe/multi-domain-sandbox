import type { ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Scripts, ScrollRestoration } from "react-router";

/**
 * SPA の <html> 全体。各 app の root.tsx の Layout から使う。
 * favicon は data: にしてリクエストを出さない
 */
export function RootDocument({ title, children }: { title: string; children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="icon" href="data:," />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/** build/client/index.html はこれで作られ、clientLoader が終わるまで表示される */
export function HydrateFallback() {
  return <p className="p-8 text-sm text-muted-foreground">読み込み中...</p>;
}

/** ルートの ErrorBoundary。loader の throw と描画中の例外を受ける */
export function RootErrorBoundary({ error }: { error: unknown }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {isRouteErrorResponse(error) ? (
        <h1 className="text-2xl font-semibold">
          {error.status} {error.statusText}
        </h1>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">エラーが発生しました</h1>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </>
      )}
    </main>
  );
}
