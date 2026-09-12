import { redirect } from "react-router";
import { loginApiResponseSchema, type LoginContextResponse } from "@sandbox/api-contract";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Notice,
} from "@sandbox/web-ui";
import { ApiError, getJson, pickQuery } from "../../lib/api.ts";
import type { Route } from "./+types/login.route";

type LoginData =
  | { readonly kind: "form"; readonly context: LoginContextResponse }
  | { readonly kind: "expired"; readonly message: string };

/**
 * /login?rid=&error=。auth-api から rid と CSRF を受け取ってフォームを描く。
 * 送信は通常のフォーム POST で、成功すれば auth-api がサービスへ 303 する。
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs): Promise<LoginData> {
  const params = pickQuery(request.url, ["rid", "error"]);
  try {
    const context = await getJson(loginApiResponseSchema, `/api/login?${params.toString()}`);
    if ("redirectTo" in context) throw redirect(context.redirectTo);
    return { kind: "form", context };
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === "expired_request") {
      return { kind: "expired", message: error.message };
    }
    throw error;
  }
}

export default function Login({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === "expired") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ログインをやり直してください</CardTitle>
          <CardDescription>{loaderData.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const { context } = loaderData;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sandbox にログイン</CardTitle>
        <CardDescription>
          auth.sandbox.com の自前ログイン画面。Cognito Hosted UI は使わない。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {context.errorMessage !== undefined && <Notice kind="error">{context.errorMessage}</Notice>}
        <form method="post" action="/login">
          <input type="hidden" name="rid" value={context.rid} />
          <input type="hidden" name="csrf" value={context.csrfToken} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="username">ユーザー名</FieldLabel>
              <Input id="username" name="username" autoComplete="username" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">パスワード</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Button type="submit" className="w-full">
              ログイン
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
