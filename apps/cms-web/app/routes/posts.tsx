import { useState, type FormEvent } from "react";
import { useRevalidator } from "react-router";
import { api, describeError, Notice, usePermissions, useShell } from "@sandbox/web-ui";
import type { Route } from "./+types/posts";

interface Post {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly author_id: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export async function clientLoader() {
  return api<{ posts: Post[] }>("/v1/posts");
}

export default function Posts({ loaderData }: Route.ComponentProps) {
  const permissions = usePermissions();
  const { me } = useShell();
  const { revalidate } = useRevalidator();
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<Post | undefined>();

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
    const json = { title: String(data.get("title") ?? ""), body: String(data.get("body") ?? "") };
    if (editing === undefined) {
      await run(() => api("/v1/posts", { method: "POST", json }));
    } else {
      await run(() => api(`/v1/posts/${editing.id}`, { method: "PATCH", json }));
      setEditing(undefined);
    }
    form.reset();
  };

  return (
    <section>
      <h2>投稿</h2>
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {!permissions.has("posts:create") && (
        <p className="muted">この役割または権限設定では投稿を作成できません</p>
      )}
      {loaderData.posts.map((post) => (
        <article key={post.id} className="editor">
          <h3>{post.title}</h3>
          <p>{post.body}</p>
          <p className="muted">
            {post.author_id === me.user.id ? "自分" : post.author_id} / {post.updated_at}
          </p>
          {permissions.has("posts:update") && (
            <button type="button" onClick={() => setEditing(post)}>
              編集
            </button>
          )}{" "}
          {permissions.has("posts:delete") && (
            <button
              type="button"
              onClick={() => void run(() => api(`/v1/posts/${post.id}`, { method: "DELETE" }))}
            >
              削除
            </button>
          )}
        </article>
      ))}

      {(permissions.has("posts:create") || editing !== undefined) && (
        <form onSubmit={(event) => void submit(event)} className="stack" key={editing?.id ?? "new"}>
          <h3>{editing === undefined ? "新しい投稿" : "投稿を編集"}</h3>
          <label>
            タイトル
            <input type="text" name="title" required defaultValue={editing?.title ?? ""} />
          </label>
          <label>
            本文
            <textarea name="body" rows={6} defaultValue={editing?.body ?? ""} />
          </label>
          <div>
            <button type="submit">{editing === undefined ? "投稿する" : "更新"}</button>{" "}
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
