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
  /** 認可リクエスト ID。ポータル用ログインでは空文字 */
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

export interface LogoutConfirmPageProps {
  readonly csrfToken: string;
  readonly clientId: string | undefined;
  readonly tenantSlug: string | undefined;
}

export function logoutConfirmPage(
  props: LogoutConfirmPageProps,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  return layout(
    "Sandbox からログアウト",
    html`
      <h1>Sandbox 全体からログアウトしますか</h1>
      <p class="muted">
        SSO Session を破棄し、ログイン済みのすべてのテナントからログアウトします。
      </p>
      <form method="post" action="/logout">
        <input type="hidden" name="csrf" value="${props.csrfToken}" />
        ${
          props.clientId === undefined
            ? ""
            : html`<input type="hidden" name="client_id" value="${props.clientId}" />`
        }
        ${
          props.tenantSlug === undefined
            ? ""
            : html`<input type="hidden" name="tenant" value="${props.tenantSlug}" />`
        }
        <button type="submit">ログアウトする</button>
      </form>
    `,
  );
}

export interface LogoutDonePageProps {
  readonly returnTo: { readonly label: string; readonly href: string } | undefined;
}

export function logoutDonePage(
  props: LogoutDonePageProps,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  return layout(
    "ログアウトしました",
    html`
      <h1>Sandbox からログアウトしました</h1>
      <p class="muted">すべてのテナントのセッションを無効化しました。</p>
      ${
        props.returnTo === undefined
          ? ""
          : html`<p><a href="${props.returnTo.href}">${props.returnTo.label} に戻る</a></p>`
      }
    `,
  );
}

export interface PortalServiceView {
  readonly name: string;
  readonly clientId: string;
  /** サービス側の /auth/login。SSO Session によりパスワードなしで入れる */
  readonly loginUrl: string;
}

export interface PortalTenantView {
  readonly slug: string;
  readonly name: string;
  readonly role: string;
  readonly services: ReadonlyArray<PortalServiceView>;
}

export interface PortalPageProps {
  readonly email: string;
  readonly tenants: ReadonlyArray<PortalTenantView>;
}

/**
 * ポータル。所属テナントごとに、契約しているサービスの入口を並べる。
 */
export function portalPage(props: PortalPageProps): HtmlEscapedString | Promise<HtmlEscapedString> {
  return layout(
    "Sandbox ポータル",
    html`
      <h1>Sandbox ポータル</h1>
      <p class="muted">${props.email} としてログイン中</p>
      ${
        props.tenants.length === 0
          ? html`<p>所属しているテナントがありません。管理者に招待を依頼してください。</p>`
          : props.tenants.map(
              (tenant) => html`
                <h2>${tenant.name} <span class="muted">(${tenant.slug} / ${tenant.role})</span></h2>
                ${
                  tenant.services.length === 0
                    ? html`<p class="muted">契約中のサービスはありません。</p>`
                    : html`<ul>
                        ${tenant.services.map(
                          (service) =>
                            html`<li>
                              <a href="${service.loginUrl}">${service.name}</a>
                              <span class="muted">${service.clientId}</span>
                            </li>`,
                        )}
                      </ul>`
                }
              `,
            )
      }
      <p><a href="/logout">Sandbox 全体からログアウト</a></p>
    `,
  );
}
