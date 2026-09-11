import { useState, type FormEvent } from "react";
import { useRevalidator } from "react-router";
import { api, describeError, Notice, usePermissions } from "@sandbox/web-ui";
import type { Route } from "./+types/end-users";

interface EndUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly note: string;
  readonly masked: boolean;
}

export async function clientLoader() {
  return api<{ end_users: EndUser[]; masked: boolean }>("/v1/end-users");
}

export default function EndUsers({ loaderData }: Route.ComponentProps) {
  const permissions = usePermissions();
  const { revalidate } = useRevalidator();
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<EndUser | undefined>();

  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
      await revalidate();
    } catch (cause: unknown) {
      setError(describeError(cause));
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const json = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
      note: String(data.get("note") ?? ""),
    };
    if (editing === undefined) {
      await run(() => api("/v1/end-users", { method: "POST", json }));
    } else {
      await run(() => api(`/v1/end-users/${editing.id}`, { method: "PATCH", json }));
      setEditing(undefined);
    }
    form.reset();
  };

  return (
    <section>
      <h2>エンドユーザー</h2>
      <p className="muted">
        {loaderData.masked
          ? "メールと電話はマスクされています。解除には end_users:unmask が必要です"
          : "メールと電話をそのまま表示しています"}
      </p>
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      <table>
        <thead>
          <tr>
            <th>名前</th>
            <th>メール</th>
            <th>電話</th>
            <th>メモ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loaderData.end_users.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td className={user.masked ? "masked" : ""}>{user.email}</td>
              <td className={user.masked ? "masked" : ""}>{user.phone}</td>
              <td>{user.note}</td>
              <td>
                {permissions.has("end_users:update") && (
                  <button type="button" onClick={() => setEditing(user)}>
                    編集
                  </button>
                )}{" "}
                {permissions.has("end_users:delete") && (
                  <button
                    type="button"
                    onClick={() =>
                      void run(() => api(`/v1/end-users/${user.id}`, { method: "DELETE" }))
                    }
                  >
                    削除
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(permissions.has("end_users:create") || editing !== undefined) && (
        <form onSubmit={(event) => void submit(event)} className="stack" key={editing?.id ?? "new"}>
          <h3>{editing === undefined ? "エンドユーザーを追加" : `${editing.name} を編集`}</h3>
          {editing?.masked === true && (
            <Notice kind="info">
              マスクされた値のまま保存すると上書きされます。必要な項目だけ変えてください
            </Notice>
          )}
          <label>
            名前
            <input type="text" name="name" required defaultValue={editing?.name ?? ""} />
          </label>
          <label>
            メール
            <input type="email" name="email" required defaultValue={editing?.email ?? ""} />
          </label>
          <label>
            電話
            <input type="text" name="phone" required defaultValue={editing?.phone ?? ""} />
          </label>
          <label>
            メモ
            <input type="text" name="note" defaultValue={editing?.note ?? ""} />
          </label>
          <div>
            <button type="submit">{editing === undefined ? "追加" : "更新"}</button>{" "}
            {editing !== undefined && (
              <button type="button" onClick={() => setEditing(undefined)}>
                やめる
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
