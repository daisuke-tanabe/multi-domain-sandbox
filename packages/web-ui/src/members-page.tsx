import { useState, type FormEvent } from "react";
import { useRevalidator } from "react-router";
import { api, describeError } from "./api.ts";
import { Notice, useShell } from "./shell.tsx";

export interface MemberRow {
  readonly user_id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly role: string;
  readonly status: "active" | "disabled";
}

export interface MemberDetail {
  readonly member: MemberRow;
  readonly overrides: ReadonlyArray<{ permission: string; effect: "allow" | "deny" }>;
  readonly permissions: ReadonlyArray<string>;
}

export function loadMembers(): Promise<{ members: MemberRow[] }> {
  return api<{ members: MemberRow[] }>("/v1/members");
}

type Effect = "inherit" | "allow" | "deny";

/**
 * 管理アカウントの一覧、招待、役割変更、権限の上書き、削除。
 * 役割と権限の語彙は /v1/me の service から受け取るので、CRM と CMS で同じ画面を使える。
 */
export function MembersPage({ members }: { members: ReadonlyArray<MemberRow> }) {
  const { me } = useShell();
  const permissions = new Set(me.permissions);
  const { revalidate } = useRevalidator();
  const [error, setError] = useState<string | undefined>();
  const [selected, setSelected] = useState<MemberDetail | undefined>();

  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
      await revalidate();
    } catch (cause: unknown) {
      setError(describeError(cause));
    }
  };

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      email: String(form.get("email") ?? ""),
      role: String(form.get("role") ?? ""),
      ...(String(form.get("name") ?? "") !== "" && { name: String(form.get("name")) }),
    };
    await run(() => api("/v1/members", { method: "POST", json: body }));
    event.currentTarget.reset();
  };

  const open = async (userId: string) => {
    setError(undefined);
    try {
      setSelected(await api<MemberDetail>(`/v1/members/${userId}`));
    } catch (cause: unknown) {
      setError(describeError(cause));
    }
  };

  return (
    <section>
      <h2>管理アカウント</h2>
      <p className="muted">
        入れるかどうかは Auth Server が持ち、役割と権限はこのサービスが持ちます。
      </p>
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      <table>
        <thead>
          <tr>
            <th>メール</th>
            <th>名前</th>
            <th>役割</th>
            <th>状態</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.user_id}>
              <td>{member.email ?? <span className="muted">{member.user_id}</span>}</td>
              <td>{member.name ?? ""}</td>
              <td>
                {permissions.has("members:manage") ? (
                  <select
                    value={member.role}
                    aria-label={`${member.email ?? member.user_id} の役割`}
                    onChange={(event) =>
                      void run(() =>
                        api(`/v1/members/${member.user_id}`, {
                          method: "PATCH",
                          json: { role: event.target.value },
                        }),
                      )
                    }
                  >
                    {me.service.roles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                ) : (
                  member.role
                )}
              </td>
              <td>{member.status}</td>
              <td>
                <button type="button" onClick={() => void open(member.user_id)}>
                  権限
                </button>{" "}
                {permissions.has("members:manage") && member.user_id !== me.user.id && (
                  <button
                    type="button"
                    onClick={() =>
                      void run(() => api(`/v1/members/${member.user_id}`, { method: "DELETE" }))
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

      {permissions.has("members:invite") && (
        <form onSubmit={(event) => void invite(event)} className="stack">
          <h3>招待</h3>
          <label>
            メール
            <input type="email" name="email" required />
          </label>
          <label>
            名前
            <input type="text" name="name" />
          </label>
          <label>
            役割
            <select name="role" defaultValue={me.service.roles.at(-1)}>
              {me.service.roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">招待する</button>
        </form>
      )}

      {selected !== undefined && (
        <PermissionEditor
          detail={selected}
          editable={permissions.has("members:manage")}
          available={me.service.permissions}
          onClose={() => setSelected(undefined)}
          onSave={async (overrides) => {
            await run(() =>
              api(`/v1/members/${selected.member.user_id}/permissions`, {
                method: "PUT",
                json: { overrides },
              }),
            );
            setSelected(undefined);
          }}
        />
      )}
    </section>
  );
}

function PermissionEditor({
  detail,
  editable,
  available,
  onClose,
  onSave,
}: {
  detail: MemberDetail;
  editable: boolean;
  available: ReadonlyArray<string>;
  onClose: () => void;
  onSave: (overrides: Array<{ permission: string; effect: "allow" | "deny" }>) => Promise<void>;
}) {
  const initial = new Map(detail.overrides.map((o) => [o.permission, o.effect]));
  const [effects, setEffects] = useState<Map<string, Effect>>(
    new Map(available.map((p) => [p, initial.get(p) ?? "inherit"])),
  );
  const granted = new Set(detail.permissions);

  return (
    <section className="editor">
      <h3>
        {detail.member.email ?? detail.member.user_id} の権限{" "}
        <span className="muted">役割 {detail.member.role}</span>
      </h3>
      <p className="muted">役割の既定に対して個別に許可 / 拒否を重ねます。拒否が優先します。</p>
      <table>
        <thead>
          <tr>
            <th>権限</th>
            <th>現在</th>
            <th>上書き</th>
          </tr>
        </thead>
        <tbody>
          {available.map((permission) => (
            <tr key={permission}>
              <td>{permission}</td>
              <td>{granted.has(permission) ? "yes" : "no"}</td>
              <td>
                <select
                  value={effects.get(permission) ?? "inherit"}
                  disabled={!editable}
                  aria-label={`${permission} の上書き`}
                  onChange={(event) =>
                    setEffects(new Map(effects).set(permission, event.target.value as Effect))
                  }
                >
                  <option value="inherit">役割どおり</option>
                  <option value="allow">許可</option>
                  <option value="deny">拒否</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable && (
        <button
          type="button"
          onClick={() =>
            void onSave(
              [...effects.entries()]
                .filter((entry): entry is [string, "allow" | "deny"] => entry[1] !== "inherit")
                .map(([permission, effect]) => ({ permission, effect })),
            )
          }
        >
          保存
        </button>
      )}{" "}
      <button type="button" onClick={onClose}>
        閉じる
      </button>
    </section>
  );
}
