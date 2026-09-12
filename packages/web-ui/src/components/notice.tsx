import type { ReactNode } from "react";
import { AlertCircleIcon, InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert.tsx";

/** 状態の通知。エラーは destructive、それ以外は既定 */
export function Notice({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  return (
    <Alert variant={kind === "error" ? "destructive" : "default"}>
      {kind === "error" ? <AlertCircleIcon /> : <InfoIcon />}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
