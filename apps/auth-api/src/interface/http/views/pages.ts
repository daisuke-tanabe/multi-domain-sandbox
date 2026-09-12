import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

const STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.25rem; }
`;

/**
 * SPA を読み込む前に確定するエラーだけをサーバー側で描く。
 * /authorize の不正な redirect_uri、CSRF 不一致、入力不正、404、500。
 * ログイン、ポータル、ログアウトの画面は apps/auth-web の SPA が描く。
 */
export function errorPage(
  title: string,
  message: string,
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
        <h1>${title}</h1>
        <p>${message}</p>
      </body>
    </html>`;
}
