import { loginChallengeResponseSchema, type LoginChallengeResponse } from "@sandbox/api-contract";
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
import type { Route } from "./+types/challenge.route";

type ChallengeData =
  | { readonly kind: "form"; readonly mid: string; readonly context: LoginChallengeResponse }
  | { readonly kind: "expired"; readonly message: string };

/**
 * /login/challenge?mid=&error=。パスワード認証のあと、認証アプリのコードを求める。
 * 送信は通常のフォーム POST で、通れば auth-api がサービスへ 303 する
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs): Promise<ChallengeData> {
  const params = pickQuery(request.url, ["mid", "error"]);
  const mid = params.get("mid") ?? "";
  try {
    const context = await getJson(
      loginChallengeResponseSchema,
      `/api/login/challenge?${params.toString()}`,
    );
    return { kind: "form", mid, context };
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === "expired_request") {
      return { kind: "expired", message: error.message };
    }
    throw error;
  }
}

export default function Challenge({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === "expired") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ログインをやり直してください</CardTitle>
          <CardDescription>{loaderData.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/login">ログイン画面へ</a>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const { mid, context } = loaderData;
  return (
    <Card>
      <CardHeader>
        <CardTitle>認証コードを入力</CardTitle>
        <CardDescription>
          認証アプリに表示されている 6 桁のコードを入力してください。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {context.errorMessage !== undefined && <Notice kind="error">{context.errorMessage}</Notice>}
        <form method="post" action="/login/challenge">
          <input type="hidden" name="mid" value={mid} />
          <input type="hidden" name="csrf" value={context.csrfToken} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="code">認証コード</FieldLabel>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                required
              />
            </Field>
            <Button type="submit" className="w-full">
              確認
            </Button>
          </FieldGroup>
        </form>
        <Button asChild variant="link" className="px-0">
          <a href="/login">最初からやり直す</a>
        </Button>
      </CardContent>
    </Card>
  );
}
