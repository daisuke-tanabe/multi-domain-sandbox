import { useState } from "react";
import type { Post } from "@sandbox/api-contract";
import { Notice, PageHeader, useAction, usePermissions, useShell } from "@sandbox/web-ui";
import { PostForm } from "./post-form.tsx";
import { PostList } from "./post-list.tsx";
import { createPost, deletePost, loadPosts, updatePost } from "./posts.api.ts";
import type { Route } from "./+types/posts.route";

export const clientLoader = loadPosts;

export default function Posts({ loaderData }: Route.ComponentProps) {
  const permissions = usePermissions();
  const { me } = useShell();
  const action = useAction();
  const [editing, setEditing] = useState<Post | undefined>();
  const canCreate = permissions.has("posts:create");

  return (
    <>
      <PageHeader
        title="投稿"
        description={
          canCreate
            ? "タイトルと本文を投稿できます。"
            : "この役割または権限設定では投稿を作成できません。"
        }
      />
      {action.error !== undefined && <Notice kind="error">{action.error}</Notice>}
      <PostList
        posts={loaderData.posts}
        currentUserId={me.user.id}
        canUpdate={permissions.has("posts:update")}
        canDelete={permissions.has("posts:delete")}
        pending={action.pending}
        onEdit={setEditing}
        onDelete={(post) => void action.run(() => deletePost(post.id))}
      />
      {(canCreate || editing !== undefined) && (
        <PostForm
          key={editing?.id ?? "new"}
          editing={editing}
          pending={action.pending}
          onCancel={() => setEditing(undefined)}
          onSubmit={async (input) => {
            const ok = await action.run(() =>
              editing === undefined ? createPost(input) : updatePost(editing.id, input),
            );
            if (ok) setEditing(undefined);
            return ok;
          }}
        />
      )}
    </>
  );
}
