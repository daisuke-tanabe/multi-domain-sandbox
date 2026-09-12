import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { inviteMemberInputSchema, type InviteMemberInput } from "@sandbox/api-contract";
import { Button } from "../../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Field, FieldError, FieldGroup, FieldLabel } from "../../components/ui/field.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";

/**
 * 招待フォーム。検証は契約の inviteMemberInputSchema をそのまま使う。
 */
export function InviteMemberForm({
  roles,
  pending,
  onSubmit,
}: {
  roles: ReadonlyArray<string>;
  pending: boolean;
  onSubmit: (input: InviteMemberInput) => Promise<boolean>;
}) {
  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberInputSchema),
    defaultValues: { email: "", role: roles.at(-1) ?? "" },
  });
  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>招待</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="max-w-md"
          onSubmit={form.handleSubmit(async (values) => {
            const input: InviteMemberInput = {
              email: values.email,
              role: values.role,
              ...(values.name !== undefined && values.name !== "" && { name: values.name }),
            };
            if (await onSubmit(input)) form.reset();
          })}
        >
          <FieldGroup>
            <Field data-invalid={errors.email !== undefined}>
              <FieldLabel htmlFor="invite-email">メール</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                aria-invalid={errors.email !== undefined}
                {...form.register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={errors.name !== undefined}>
              <FieldLabel htmlFor="invite-name">名前</FieldLabel>
              <Input
                id="invite-name"
                aria-invalid={errors.name !== undefined}
                {...form.register("name", {
                  setValueAs: (v: string) => (v === "" ? undefined : v),
                })}
              />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={errors.role !== undefined}>
              <FieldLabel htmlFor="invite-role">役割</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="invite-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.role]} />
            </Field>
            <div>
              <Button type="submit" disabled={pending}>
                招待する
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
