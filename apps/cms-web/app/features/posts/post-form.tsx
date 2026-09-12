import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { postInputSchema, type Post, type PostInput } from "@sandbox/api-contract";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@sandbox/web-ui";

/**
 * 投稿の作成と編集。検証は契約の postInputSchema をそのまま使う。
 */
export function PostForm({
  editing,
  pending,
  onSubmit,
  onCancel,
}: {
  editing: Post | undefined;
  pending: boolean;
  onSubmit: (input: PostInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const form = useForm<PostInput>({
    resolver: zodResolver(postInputSchema),
    defaultValues: { title: editing?.title ?? "", body: editing?.body ?? "" },
  });
  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing === undefined ? "新しい投稿" : "投稿を編集"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="max-w-2xl"
          onSubmit={form.handleSubmit(async (values) => {
            if (await onSubmit(values)) form.reset();
          })}
        >
          <FieldGroup>
            <Field data-invalid={errors.title !== undefined}>
              <FieldLabel htmlFor="post-title">タイトル</FieldLabel>
              <Input
                id="post-title"
                aria-invalid={errors.title !== undefined}
                {...form.register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={errors.body !== undefined}>
              <FieldLabel htmlFor="post-body">本文</FieldLabel>
              <Textarea
                id="post-body"
                rows={6}
                aria-invalid={errors.body !== undefined}
                {...form.register("body")}
              />
              <FieldError errors={[errors.body]} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {editing === undefined ? "投稿する" : "更新"}
              </Button>
              {editing !== undefined && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  やめる
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
