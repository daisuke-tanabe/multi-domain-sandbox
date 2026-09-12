import type { Post } from "@sandbox/api-contract";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@sandbox/web-ui";

export function PostList({
  posts,
  currentUserId,
  canUpdate,
  canDelete,
  pending,
  onEdit,
  onDelete,
}: {
  posts: ReadonlyArray<Post>;
  currentUserId: string;
  canUpdate: boolean;
  canDelete: boolean;
  pending: boolean;
  onEdit: (post: Post) => void;
  onDelete: (post: Post) => void;
}) {
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <Card key={post.id}>
          <CardHeader>
            <CardTitle>{post.title}</CardTitle>
            <CardDescription>
              {post.author_id === currentUserId ? "自分" : post.author_id} / {post.updated_at}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{post.body}</p>
          </CardContent>
          {(canUpdate || canDelete) && (
            <CardFooter className="gap-2">
              {canUpdate && (
                <Button variant="outline" size="sm" onClick={() => onEdit(post)}>
                  編集
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => onDelete(post)}
                >
                  削除
                </Button>
              )}
            </CardFooter>
          )}
        </Card>
      ))}
    </div>
  );
}
