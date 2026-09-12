import { redirect } from "react-router";
import { loginApiResponseSchema, type LoginContextResponse } from "@sandbox/api-contract";
import { Notice } from "@sandbox/web-ui";
import { ApiError, getJson } from "../api.ts";
import type { Route } from "./+types/login";

type LoginData =
  | { readonly kind: "form"; readonly context: LoginContextResponse }
  | { readonly kind: "expired"; readonly message: string };

/**
 * /login?rid=&error=。auth-api から rid と CSRF を受け取ってフォームを描く。
 * 送信は通常のフォーム POST で、成功すれば auth-api がサービスへ 302 する。
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs): Promise<LoginData> {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["rid", "error"]) {
    const value = url.searchParams.get(key);
    if (value !== null) params.set(key, value);
  }
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
      <>
        <h1>ログインをやり直してください</h1>
        <p>{loaderData.message}</p>
      </>
    );
  }
  const { context } = loaderData;
  return (
    <>
      <h1>Sandbox にログイン</h1>
      <p className="muted">auth.sandbox.com の自前ログイン画面。Cognito Hosted UI は使いません。</p>
      {context.errorMessage !== undefined && <Notice kind="error">{context.errorMessage}</Notice>}
      <form method="post" action="/login" className="stack">
        <input type="hidden" name="rid" value={context.rid} />
        <input type="hidden" name="csrf" value={context.csrfToken} />
        <label>
          ユーザー名
          <input type="text" name="username" autoComplete="username" required />
        </label>
        <label>
          パスワード
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button type="submit">ログイン</button>
      </form>
    </>
  );
}
