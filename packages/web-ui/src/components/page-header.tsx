import type { ReactNode } from "react";

/** 画面の先頭。タイトルと補足の一文 */
export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description !== undefined && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
