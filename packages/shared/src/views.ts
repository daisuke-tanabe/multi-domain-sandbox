import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

const STYLE = `
  body { font-family: system-ui, sans-serif; margin: 3rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.25rem; }
  .muted { color: #666; font-size: 0.9rem; }
`;

export interface MinimalErrorPage {
  readonly title: string;
  readonly message: string;
  /** ブラウザのタブに出す補足。省略時は title だけ */
  readonly titleSuffix?: string;
  /** 本文の下に出す補足と戻り先。SPA を配る側だけが付ける */
  readonly footer?: string;
  readonly homeLink?: boolean;
  readonly maxWidth?: string;
}

/**
 * SPA を読み込む前に確定するエラーだけをサーバー側で描く最小の HTML。
 * web-core と auth-api で同じ骨格を使う。
 */
export function minimalErrorPage(page: MinimalErrorPage): Html {
  const width = page.maxWidth ?? "28rem";
  return html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>
          ${page.titleSuffix === undefined ? page.title : `${page.title} | ${page.titleSuffix}`}
        </title>
        <style>
          ${raw(STYLE)} body {
            max-width: ${raw(width)};
          }
        </style>
      </head>
      <body>
        <h1>${page.title}</h1>
        <p>${page.message}</p>
        ${page.footer === undefined ? "" : html`<p class="muted">${page.footer}</p>`}
        ${page.homeLink === true ? html`<p><a href="/">トップへ戻る</a></p>` : ""}
      </body>
    </html>`;
}
