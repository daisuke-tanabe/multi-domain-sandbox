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
import { ExpiredCard } from "../../components/expired-card.tsx";
import { getJson, loadOrExpired, pickQuery, type Loaded } from "../../lib/api.ts";
import type { Route } from "./+types/challenge.route";

type ChallengeData = Loaded<{ readonly mid: string; readonly context: LoginChallengeResponse }>;

/**
 * /login/challenge?mid=&error=。パスワード認証のあと、認証アプリのコードを求める。
 * 送信は通常のフォーム POST で、通れば auth-api がサービスへ 303 する
 */
export function clientLoader({ request }: Route.ClientLoaderArgs): Promise<ChallengeData> {
  const params = pickQuery(request.url, ["mid", "error"]);
  return loadOrExpired(async () => ({
    mid: params.get("mid") ?? "",
    context: await getJson(
      loginChallengeResponseSchema,
      `/api/login/challenge?${params.toString()}`,
    ),
  }));
}

export default function Challenge({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === "expired") return <ExpiredCard message={loaderData.message} />;
  const { mid, context } = loaderData.data;
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
