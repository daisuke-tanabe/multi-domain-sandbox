import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { RootDocument } from "@sandbox/web-ui";
import "@sandbox/web-ui/styles.css";

export { HydrateFallback, RootErrorBoundary as ErrorBoundary } from "@sandbox/web-ui";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <RootDocument title="Sandbox">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
        {children}
      </main>
    </RootDocument>
  );
}

export default function App() {
  return <Outlet />;
}
