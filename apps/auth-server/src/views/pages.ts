import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

const STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.25rem; }
  label { display: block; margin-top: 1rem; }
  input { width: 100%; padding: 0.5rem; margin-top: 0.25rem; box-sizing: border-box; }
  button { margin-top: 1.5rem; padding: 0.6rem 1.2rem; }
  .error { color: #b00020; margin-top: 1rem; }
  .muted { color: #666; font-size: 0.9rem; }
`;

function layout(
  title: string,
  body: HtmlEscapedString | Promise<HtmlEscapedString>,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  return html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          ${raw(STYLE)}
        </style>
      </head>
      <body>
        ${body}
      </body>
    </html>`;
}

export interface LoginPageProps {
  readonly rid: string;
  readonly csrfToken: string;
  readonly errorMessage?: string;
  readonly username?: string;
}

export function loginPage(props: LoginPageProps): HtmlEscapedString | Promise<HtmlEscapedString> {
  return layout(
    "Sandbox ログイン",
    html`
      <h1>Sandbox にログイン</h1>
      <p class="muted">auth.sandbox.com の自前ログイン画面。Cognito Hosted UI は使いません。</p>
      ${props.errorMessage === undefined ? "" : html`<p class="error" role="alert">${props.errorMessage}</p>`}
      <form method="post" action="/login">
        <input type="hidden" name="rid" value="${props.rid}" />
        <input type="hidden" name="csrf" value="${props.csrfToken}" />
        <label>
          ユーザー名
          <input
            type="text"
            name="username"
            autocomplete="username"
            required
            value="${props.username ?? ""}"
          />
        </label>
        <label>
          パスワード
          <input type="password" name="password" autocomplete="current-password" required />
        </label>
        <button type="submit">ログイン</button>
      </form>
    `,
  );
}

export function errorPage(
  title: string,
  message: string,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  return layout(
    title,
    html`
      <h1>${title}</h1>
      <p>${message}</p>
    `,
  );
}
