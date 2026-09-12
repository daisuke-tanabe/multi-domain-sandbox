import { useRouteLoaderData } from "react-router";
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

export function useShellData(): ShellData {
  const data = useRouteLoaderData("root") as ShellData | undefined;
  if (data === undefined) throw new Error("shell data is not loaded");
  return data;
}

export function useShell(): { readonly session: AuthenticatedSession; readonly me: MeResponse } {
  const data = useShellData();
  if (data.me === undefined) throw new Error("shell data is not loaded");
  return { session: data.session, me: data.me };
}

export function usePermissions(): ReadonlySet<string> {
  return new Set(useShell().me.permissions);
}
