import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { endUserInputSchema, type EndUser, type EndUserInput } from "@sandbox/api-contract";
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
  Notice,
} from "@sandbox/web-ui";

type FormValues = z.input<typeof endUserInputSchema>;

const FIELDS: ReadonlyArray<{ name: keyof FormValues; label: string; type?: string }> = [
  { name: "name", label: "名前" },
  { name: "email", label: "メール", type: "email" },
  { name: "phone", label: "電話" },
  { name: "note", label: "メモ" },
];

/**
 * エンドユーザーの追加と編集。検証は契約の endUserInputSchema をそのまま使う。
 */
export function EndUserForm({
  editing,
  pending,
  onSubmit,
  onCancel,
}: {
  editing: EndUser | undefined;
  pending: boolean;
  onSubmit: (input: EndUserInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const form = useForm<FormValues, unknown, EndUserInput>({
    resolver: zodResolver(endUserInputSchema),
    defaultValues: {
      name: editing?.name ?? "",
      email: editing?.email ?? "",
      phone: editing?.phone ?? "",
      note: editing?.note ?? "",
    },
  });
  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {editing === undefined ? "エンドユーザーを追加" : `${editing.name} を編集`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing?.masked === true && (
          <Notice kind="info">
            マスクされた値のまま保存すると上書きされる。必要な項目だけ変えること。
          </Notice>
        )}
        <form
          className="max-w-md"
          onSubmit={form.handleSubmit(async (values) => {
            if (await onSubmit(values)) form.reset();
          })}
        >
          <FieldGroup>
            {FIELDS.map((field) => (
              <Field key={field.name} data-invalid={errors[field.name] !== undefined}>
                <FieldLabel htmlFor={`end-user-${field.name}`}>{field.label}</FieldLabel>
                <Input
                  id={`end-user-${field.name}`}
                  type={field.type ?? "text"}
                  aria-invalid={errors[field.name] !== undefined}
                  {...form.register(field.name)}
                />
                <FieldError errors={[errors[field.name]]} />
              </Field>
            ))}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {editing === undefined ? "追加" : "更新"}
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
