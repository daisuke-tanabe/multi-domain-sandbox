import type { ReactNode } from "react";
import { NavLink, Outlet, useRouteLoaderData } from "react-router";
import type { AuthenticatedSession, MeResponse, SessionResponse } from "@sandbox/api-contract";
import { loadMe, loadSession, redirectToLogin } from "./api.ts";

export type ShellData =
  | { readonly session: AuthenticatedSession; readonly me: MeResponse }
  /** Tenant Logout 直後の画面だけ */
  | { readonly session: SessionResponse; readonly me: undefined };

/**
 * ルートの clientLoader。未ログインなら BFF の /auth/login へ送る。
 * Tenant Logout 直後は /?logged_out=1 に戻るので、そのときだけログアウト済み画面を出す。
 * ログイン済みなら /session と /v1/me をまとめて読み、配下の画面が useShell で参照する。
 */
export async function loadShell(): Promise<ShellData> {
  const session = await loadSession();
  if (!session.authenticated) {
    const loggedOut = new URLSearchParams(window.location.search).get("logged_out") === "1";
    if (loggedOut) return { session, me: undefined };
    redirectToLogin();
  }
  const me = await loadMe();
  return { session, me };
}

export function useShell(): { readonly session: AuthenticatedSession; readonly me: MeResponse } {
  const data = useRouteLoaderData("root") as ShellData | undefined;
  if (data?.me === undefined) throw new Error("shell data is not loaded");
  return { session: data.session, me: data.me };
}

export function usePermissions(): ReadonlySet<string> {
  return new Set(useShell().me.permissions);
}

export interface NavItem {
  readonly to: string;
  readonly label: string;
  /** 省略時は常に表示 */
  readonly permission?: string;
}

/**
 * 全画面共通の枠。サービス名、テナント、ユーザー、ナビゲーション、ログアウト。
 */
export function AppShell({ nav, children }: { nav: ReadonlyArray<NavItem>; children?: ReactNode }) {
  const data = useRouteLoaderData("root") as ShellData | undefined;
  if (data === undefined) throw new Error("shell data is not loaded");
  if (data.me === undefined) return <LoggedOut session={data.session} />;
  const { session, me } = data;
  const permissions = new Set(me.permissions);
  return (
    <div className="shell">
      <header className="shell-header">
        <div>
          <h1>
            {session.service.name} <span className="muted">{session.tenant.slug}</span>
          </h1>
          <nav>
            {nav
              .filter((item) => item.permission === undefined || permissions.has(item.permission))
              .map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                  {item.label}
                </NavLink>
              ))}
          </nav>
        </div>
        <div className="viewer">
          <span className="muted">
            {me.user.email ?? me.user.id} / {me.role}
          </span>
          <form method="post" action={session.urls.logout} className="inline">
            <input type="hidden" name="csrf" value={session.csrfToken} />
            <button type="submit">ログアウト</button>
          </form>
          <a href={session.urls.globalLogout} className="muted">
            全体からログアウト
          </a>
        </div>
      </header>
      <main>{children ?? <Outlet />}</main>
    </div>
  );
}

function LoggedOut({ session }: { session: SessionResponse }) {
  return (
    <div className="shell">
      <h1>
        {session.service.name} <span className="muted">{session.tenant.slug}</span>
      </h1>
      <p>ログアウトしました。</p>
      <p>
        <a href={`${session.urls.login}?return_to=%2F`}>もう一度ログインする</a>
      </p>
    </div>
  );
}

export function Notice({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  return <p className={kind === "error" ? "notice error" : "notice"}>{children}</p>;
}

export function Loading() {
  return <p className="muted">読み込み中...</p>;
}
