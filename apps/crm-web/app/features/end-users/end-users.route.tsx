import { useState } from "react";
import type { EndUser } from "@sandbox/api-contract";
import { Notice, PageHeader, useAction, usePermissions } from "@sandbox/web-ui";
import { EndUserForm } from "./end-user-form.tsx";
import { EndUserTable } from "./end-user-table.tsx";
import { createEndUser, deleteEndUser, loadEndUsers, updateEndUser } from "./end-users.api.ts";
import type { Route } from "./+types/end-users.route";

export const clientLoader = loadEndUsers;

export default function EndUsers({ loaderData }: Route.ComponentProps) {
  const permissions = usePermissions();
  const action = useAction();
  const [editing, setEditing] = useState<EndUser | undefined>();

  return (
    <>
      <PageHeader
        title="エンドユーザー"
        description={
          loaderData.masked
            ? "メールと電話はマスクされています。解除には end_users:unmask が必要です。"
            : "メールと電話をそのまま表示しています。"
        }
      />
      {action.error !== undefined && <Notice kind="error">{action.error}</Notice>}
      <EndUserTable
        endUsers={loaderData.end_users}
        canUpdate={permissions.has("end_users:update")}
        canDelete={permissions.has("end_users:delete")}
        pending={action.pending}
        onEdit={setEditing}
        onDelete={(user) => void action.run(() => deleteEndUser(user.id))}
      />
      {(permissions.has("end_users:create") || editing !== undefined) && (
        <EndUserForm
          key={editing?.id ?? "new"}
          editing={editing}
          pending={action.pending}
          onCancel={() => setEditing(undefined)}
          onSubmit={async (input) => {
            const ok = await action.run(() =>
              editing === undefined ? createEndUser(input) : updateEndUser(editing.id, input),
            );
            if (ok) setEditing(undefined);
            return ok;
          }}
        />
      )}
    </>
  );
}
