import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { AppShell, configureZodLocale, loadShell } from "@sandbox/web-ui";
import "@sandbox/web-ui/styles.css";
import type { Route } from "./+types/root";

configureZodLocale();

export const clientLoader = loadShell;

const NAV = [
  { to: "/", label: "ホーム" },
  { to: "/end-users", label: "エンドユーザー", permission: "end_users:read" },
  { to: "/members", label: "管理アカウント", permission: "members:read" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>CRM</title>
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

export default function App() {
  return (
    <AppShell nav={NAV}>
      <Outlet />
    </AppShell>
  );
}

// build/client/index.html はこれで作られ、clientLoader が終わるまで表示される
export function HydrateFallback() {
  return <p className="p-8 text-sm text-muted-foreground">読み込み中...</p>;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold">
          {error.status} {error.statusText}
        </h1>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold">エラーが発生しました</h1>
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
    </main>
  );
}
