import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { cn } from "cn";
import type { SessionResponse } from "@sandbox/api-contract";
import { useShellData } from "../lib/shell.ts";
import { Button } from "./ui/button.tsx";

export interface NavItem {
  readonly to: string;
  readonly label: string;
  /** 省略時は常に表示 */
  readonly permission?: string;
}

/**
 * 全画面共通の枠。ヘッダにサービス名とテナント、ナビゲーション、ユーザーとログアウト。
 * 権限がない項目は出さない。
 */
export function AppShell({ nav, children }: { nav: ReadonlyArray<NavItem>; children?: ReactNode }) {
  const data = useShellData();
  if (data.me === undefined) return <LoggedOut session={data.session} />;
  const { session, me } = data;
  const permissions = new Set(me.permissions);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-8">
            <div className="text-base font-semibold">
              {session.service.name}{" "}
              <span className="font-normal text-muted-foreground">{session.tenant.slug}</span>
            </div>
            <nav className="flex items-center gap-1">
              {nav
                .filter((item) => item.permission === undefined || permissions.has(item.permission))
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        isActive && "bg-accent text-accent-foreground font-medium",
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {me.user.email ?? me.user.id} / {me.role}
            </span>
            <form method="post" action={session.urls.logout}>
              <input type="hidden" name="csrf" value={session.csrfToken} />
              <Button type="submit" variant="outline" size="sm">
                ログアウト
              </Button>
            </form>
            <Button asChild variant="link" size="sm">
              <a href={session.urls.globalLogout}>全体からログアウト</a>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">{children ?? <Outlet />}</main>
    </div>
  );
}

function LoggedOut({ session }: { session: SessionResponse }) {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">
        {session.service.name}{" "}
        <span className="font-normal text-muted-foreground">{session.tenant.slug}</span>
      </h1>
      <p>ログアウトしました。</p>
      <Button asChild>
        <a href={`${session.urls.login}?return_to=%2F`}>もう一度ログインする</a>
      </Button>
    </main>
  );
}
