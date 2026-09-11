import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

const STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; color: #222; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ddd; padding-bottom: 0.75rem; }
  h1 { font-size: 1.25rem; margin: 0; }
  nav a { margin-right: 1rem; }
  .muted { color: #666; font-size: 0.9rem; }
  .error { color: #b00020; }
  form.inline { display: inline; }
  button { padding: 0.4rem 0.8rem; }
  ul { padding-left: 1.2rem; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #ddd; padding: 0.3rem 0.6rem; text-align: left; }
`;

export interface Viewer {
  readonly name: string | null;
  readonly email: string | null;
  readonly csrfToken: string;
}

function layout(
  serviceName: string,
  tenantSlug: string,
  title: string,
  viewer: Viewer | undefined,
  body: Html,
): Html {
  return html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title} | ${tenantSlug} / ${serviceName}</title>
        <style>
          ${raw(STYLE)}
        </style>
      </head>
      <body>
        <header>
          <h1>${serviceName} <span class="muted">${tenantSlug}</span></h1>
          <nav>
            <a href="/">Home</a>
            <a href="/dashboard">Dashboard</a>
            ${
              viewer === undefined
                ? html`<a href="/auth/login">ログイン</a>`
                : html`<span class="muted">${viewer.name ?? viewer.email ?? "user"}</span>
                    <form class="inline" method="post" action="/auth/logout">
                      <input type="hidden" name="csrf" value="${viewer.csrfToken}" />
                      <button type="submit">ログアウト</button>
                    </form>`
            }
          </nav>
        </header>
        <main>${body}</main>
      </body>
    </html>`;
}

export interface HomePageProps {
  readonly serviceName: string;
  readonly tenantSlug: string;
  readonly viewer: Viewer | undefined;
  /** Tenant Logout 直後に true。Global Logout への導線を出す */
  readonly justLoggedOut: boolean;
  readonly globalLogoutUrl: string;
}

export function homePage(props: HomePageProps): Html {
  const { serviceName, tenantSlug, viewer } = props;
  return layout(
    serviceName,
    tenantSlug,
    "Home",
    viewer,
    html`
      <h2>${serviceName} / ${tenantSlug}</h2>
      ${
        props.justLoggedOut
          ? html`<p>
              ${tenantSlug} からログアウトしました。auth.sandbox の SSO Session
              は残っているため、Dashboard を開くとパスワードなしで再ログインされます。
              すべてのテナントからログアウトするには
              <a href="${props.globalLogoutUrl}">Sandbox 全体からログアウト</a>
              を使います。
            </p>`
          : ""
      }
      ${
        viewer === undefined
          ? html`<p>
              未ログインです。<a href="/auth/login?return_to=/dashboard"
                >ログインして Dashboard を見る</a
              >
            </p>`
          : html`<p>
              ログイン済みです。<a href="/dashboard">Dashboard</a> へ進めます。
              <a href="${props.globalLogoutUrl}">Sandbox 全体からログアウト</a>
            </p>`
      }
      <p class="muted">
        このテナントのセッション Cookie はこのホストにだけ発行されます。別テナントへ移動すると
        auth.sandbox の SSO Session によりログイン画面なしで再ログインされます。
      </p>
    `,
  );
}

export interface DashboardPageProps {
  readonly serviceName: string;
  readonly tenantSlug: string;
  readonly viewer: Viewer;
  readonly role: string;
  readonly permissions: ReadonlyArray<string>;
  readonly availablePermissions: ReadonlyArray<string>;
}

export function dashboardPage(props: DashboardPageProps): Html {
  const granted = new Set(props.permissions);
  return layout(
    props.serviceName,
    props.tenantSlug,
    "Dashboard",
    props.viewer,
    html`
      <h2>Dashboard</h2>
      <p class="muted">role: ${props.role}</p>
      <table>
        <thead>
          <tr>
            <th>Permission</th>
            <th>Granted</th>
          </tr>
        </thead>
        <tbody>
          ${props.availablePermissions.map(
            (permission) => html`<tr>
              <td>${permission}</td>
              <td>${granted.has(permission) ? "yes" : "no"}</td>
            </tr>`,
          )}
        </tbody>
      </table>
    `,
  );
}

export interface PageLabels {
  readonly serviceName: string;
  readonly tenantSlug: string;
}

export function errorPage(labels: PageLabels, title: string, message: string): Html {
  return layout(
    labels.serviceName,
    labels.tenantSlug,
    title,
    undefined,
    html`
      <h2>${title}</h2>
      <p>${message}</p>
      <p><a href="/">トップへ戻る</a></p>
    `,
  );
}
