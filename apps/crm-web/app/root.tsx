import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { AppShell, configureZodLocale, loadShell, RootDocument } from "@sandbox/web-ui";
import "@sandbox/web-ui/styles.css";

configureZodLocale();

export const clientLoader = loadShell;
// /session と /v1/me は画面遷移のたびに読み直さない。書き込み後は useAction の revalidate で更新する
export const shouldRevalidate = () => false;
export { HydrateFallback, RootErrorBoundary as ErrorBoundary } from "@sandbox/web-ui";

const NAV = [
  { to: "/", label: "ホーム" },
  { to: "/end-users", label: "エンドユーザー", permission: "end_users:read" },
  { to: "/members", label: "管理アカウント", permission: "members:read" },
];

export function Layout({ children }: { children: ReactNode }) {
  return <RootDocument title="CRM">{children}</RootDocument>;
}

export default function App() {
  return (
    <AppShell nav={NAV}>
      <Outlet />
    </AppShell>
  );
}
