import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

const STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.25rem; }
  .muted { color: #666; font-size: 0.9rem; }
`;

export interface PageLabels {
  readonly serviceName: string;
  readonly tenantSlug: string;
}

/**
 * BFF が直接返す唯一の画面。認可コールバックの失敗など SPA に渡す前に起きるエラー用。
 * 通常の画面は SPA が描く。
 */
export function errorPage(labels: PageLabels, title: string, message: string): Html {
  return html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title} | ${labels.tenantSlug} / ${labels.serviceName}</title>
        <style>
          ${raw(STYLE)}
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>${message}</p>
        <p class="muted">${labels.serviceName} / ${labels.tenantSlug}</p>
        <p><a href="/">トップへ戻る</a></p>
      </body>
    </html>`;
}
