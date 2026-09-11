import type { Hono } from "hono";
import { createApiHarness, type ApiHarness } from "@sandbox/api-core/test-support";
import {
  createHarness as createAuthHarness,
  type TestHarness as AuthHarness,
} from "@sandbox/auth-api/test-support";
import {
  OidcProvider,
  type OidcClientDeps,
  type OidcEnv,
  type ServiceConfig,
} from "@sandbox/oidc-client";
import { createMemoryStoreFactory, silentLogger } from "@sandbox/shared";
import { createWebCoreApp } from "./app.ts";
import { createClientResolvers } from "./config.ts";

/**
 * SANDBOX_DOMAIN を設定すると smoke / chrome-check を AWS 上の環境に向けられる。
 * 例: SANDBOX_DOMAIN=sandbox.daisuke-tanabe.dev
 * 未設定ならローカルの localhost 構成。vitest はこちらを使う
 */
const remoteDomain = process.env.SANDBOX_DOMAIN;
export const PUBLIC_SCHEME = remoteDomain === undefined ? "http" : "https";
export const AUTH_HOST =
  remoteDomain === undefined ? "auth.localhost:3000" : `auth.${remoteDomain}`;
export const AUTH_BACKCHANNEL_HOST = "127.0.0.1:3000";
export const AUTH_ORIGIN = `${PUBLIC_SCHEME}://${AUTH_HOST}`;
/** サービスごとのベースホスト。テナントはその先頭ラベルになる */
export const CRM_BASE_HOST =
  remoteDomain === undefined ? "crm.localhost:3001" : `crm.${remoteDomain}`;
export const CMS_BASE_HOST =
  remoteDomain === undefined ? "cms.localhost:3003" : `cms.${remoteDomain}`;
export const CRM_API_ORIGIN =
  remoteDomain === undefined ? "http://api.crm.localhost:3002" : `https://api.crm.${remoteDomain}`;
export const CMS_API_ORIGIN =
  remoteDomain === undefined ? "http://api.cms.localhost:3004" : `https://api.cms.${remoteDomain}`;
export const TANAKA_CRM_ORIGIN = `${PUBLIC_SCHEME}://tanaka.${CRM_BASE_HOST}`;
export const SUZUKI_CRM_ORIGIN = `${PUBLIC_SCHEME}://suzuki.${CRM_BASE_HOST}`;
export const TANAKA_CMS_ORIGIN = `${PUBLIC_SCHEME}://tanaka.${CMS_BASE_HOST}`;
export const SUZUKI_CMS_ORIGIN = `${PUBLIC_SCHEME}://suzuki.${CMS_BASE_HOST}`;
/** smoke / chrome-check が使うテストユーザーのパスワード。AWS では Secrets Manager の値を渡す */
export const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? "alice-password";

interface Requestable {
  request(input: string, init?: RequestInit): Response | Promise<Response>;
}

/**
 * auth-api / crm-web / crm-api / cms-web / cms-api を 1 プロセスで接続した環境。
 * ホスト名でディスパッチする。web と api はサービスごとに別インスタンスを作り、本番のプロセス分割を模す。
 */
export interface ServiceHarness {
  readonly web: Hono<OidcEnv>;
  readonly webDeps: OidcClientDeps;
  readonly api: ApiHarness;
}

export interface SandboxHarness {
  readonly auth: AuthHarness;
  readonly crm: ServiceHarness;
  readonly cms: ServiceHarness;
  readonly dispatch: (url: URL, init?: RequestInit) => Promise<Response>;
}

export async function createSandbox(): Promise<SandboxHarness> {
  // apps は後から埋める。auth-api の Back-Channel Logout もこの dispatch を通る
  const apps = new Map<string, Requestable>();
  const dispatch = async (url: URL, init: RequestInit = {}): Promise<Response> => {
    const app = apps.get(url.host);
    if (app === undefined) throw new Error(`no app for host ${url.host}`);
    const headers = new Headers(init.headers);
    headers.set("host", url.host);
    return Promise.resolve(app.request(url.toString(), { ...init, headers }));
  };

  const auth = await createAuthHarness({ fetch: (input, init) => dispatch(new URL(input), init) });

  const createService = async (
    service: ServiceConfig,
    baseHost: string,
  ): Promise<ServiceHarness> => {
    const api = await createApiHarness({
      signingKey: auth.deps.signingKey,
      clock: auth.clock,
      audience: service.apiBaseUrl,
    });
    const stores = createMemoryStoreFactory(auth.clock);
    const webDeps: OidcClientDeps = {
      provider: {
        issuer: `http://${AUTH_HOST}`,
        backchannelBaseUrl: `http://${AUTH_BACKCHANNEL_HOST}`,
      },
      ...createClientResolvers({ publicScheme: "http", baseHost, service }),
      sessions: stores.kv("sess"),
      sessionsBySid: stores.set("sid"),
      preAuth: stores.kv("pre"),
      refreshLocks: stores.kv("lock"),
      rateLimits: stores.counter("ratelimit"),
      // FakeClock なので待ち時間は最小にし、ロック保持側の署名処理が進むだけの実時間を空ける
      sleep: () => new Promise((resolve) => setTimeout(resolve, 20)),
      clock: auth.clock,
      cookiePolicy: { secure: false },
      logger: silentLogger,
      fetch: (input, init) => dispatch(new URL(input), init),
    };
    const provider = new OidcProvider(webDeps.provider, webDeps.fetch, auth.clock);
    const web = createWebCoreApp({ deps: webDeps, provider });
    apps.set(new URL(service.apiBaseUrl).host, api.app);
    // Back-Channel Logout はサービス単位の URI (crm.localhost:3001 など) に届く
    apps.set(baseHost, web);
    for (const slug of ["tanaka", "suzuki"]) apps.set(`${slug}.${baseHost}`, web);
    return { web, webDeps, api };
  };

  const scopes = ["openid", "profile", "email"];
  const crm = await createService(
    {
      clientId: "crm",
      clientSecret: "service-secret",
      name: "CRM",
      scopes,
      apiBaseUrl: CRM_API_ORIGIN,
    },
    CRM_BASE_HOST,
  );
  const cms = await createService(
    {
      clientId: "cms",
      clientSecret: "service-secret",
      name: "CMS",
      scopes,
      apiBaseUrl: CMS_API_ORIGIN,
    },
    CMS_BASE_HOST,
  );

  apps.set(AUTH_HOST, auth.app);
  apps.set(AUTH_BACKCHANNEL_HOST, auth.app);

  return { auth, crm, cms, dispatch };
}

interface StoredCookie {
  readonly value: string;
  readonly path: string;
}

export interface NavigationResult {
  readonly response: Response;
  readonly body: string;
  readonly finalUrl: URL;
  readonly history: ReadonlyArray<URL>;
}

const MAX_REDIRECTS = 10;

/**
 * ホストごとに Cookie を分けて保持し、リダイレクトを追跡する簡易ブラウザ。
 * Domain 属性は解釈しない。本設計では使わないため、付いていたらテストを失敗させる。
 */
export class Browser {
  private readonly jar = new Map<string, Map<string, StoredCookie>>();

  constructor(private readonly dispatch: (url: URL, init?: RequestInit) => Promise<Response>) {}

  public cookies(host: string): ReadonlyMap<string, string> {
    const cookies = this.jar.get(host) ?? new Map<string, StoredCookie>();
    return new Map([...cookies.entries()].map(([name, cookie]) => [name, cookie.value]));
  }

  public navigate(url: string): Promise<NavigationResult> {
    return this.request(new URL(url), { method: "GET" }, []);
  }

  public submitForm(url: string, fields: Record<string, string>): Promise<NavigationResult> {
    return this.request(
      new URL(url),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
      },
      [],
    );
  }

  private async request(url: URL, init: RequestInit, history: URL[]): Promise<NavigationResult> {
    if (history.length > MAX_REDIRECTS) throw new Error("too many redirects");
    const headers = new Headers(init.headers);
    const cookieHeader = this.cookieHeaderFor(url);
    if (cookieHeader !== "") headers.set("Cookie", cookieHeader);

    const response = await this.dispatch(url, { ...init, headers });
    this.storeCookies(url, response);
    const nextHistory = [...history, url];

    const location = response.headers.get("Location");
    if (response.status >= 300 && response.status < 400 && location !== null) {
      return this.request(new URL(location, url), { method: "GET" }, nextHistory);
    }
    return { response, body: await response.text(), finalUrl: url, history: nextHistory };
  }

  private cookieHeaderFor(url: URL): string {
    const cookies = this.jar.get(url.host) ?? new Map<string, StoredCookie>();
    return [...cookies.entries()]
      .filter(([, cookie]) => url.pathname.startsWith(cookie.path))
      .map(([name, cookie]) => `${name}=${cookie.value}`)
      .join("; ");
  }

  private storeCookies(url: URL, response: Response): void {
    const cookies = this.jar.get(url.host) ?? new Map<string, StoredCookie>();
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";").map((part) => part.trim());
      const [name, ...rest] = (pair ?? "").split("=");
      if (name === undefined || name === "") continue;
      const value = rest.join("=");
      const attrs = new Map(
        attributes.map((attribute) => {
          const [key, ...valueParts] = attribute.split("=");
          return [(key ?? "").toLowerCase(), valueParts.join("=")];
        }),
      );
      if (attrs.has("domain")) throw new Error(`cookie ${name} must not carry Domain attribute`);
      const maxAge = attrs.get("max-age");
      if (value === "" || (maxAge !== undefined && Number(maxAge) <= 0)) {
        cookies.delete(name);
        continue;
      }
      cookies.set(name, { value, path: attrs.get("path") ?? "/" });
    }
    this.jar.set(url.host, cookies);
  }
}

/** ログイン画面の hidden 値を取り出す */
export function readLoginForm(body: string): { rid: string; csrf: string } {
  const rid = /name="rid" value="([^"]+)"/.exec(body)?.[1];
  const csrf = /name="csrf" value="([^"]+)"/.exec(body)?.[1];
  if (rid === undefined || csrf === undefined) throw new Error("login form not found");
  return { rid, csrf };
}

/** ページ内の Logout / 作成フォームの csrf を取り出す */
export function readPageCsrf(body: string): string {
  const csrf = /name="csrf" value="([^"]+)"/.exec(body)?.[1];
  if (csrf === undefined) throw new Error("csrf not found in page");
  return csrf;
}

/**
 * 対象テナントへアクセスし、ログイン画面が出たら資格情報を入力して完了させる。
 */
export async function loginThrough(
  browser: Browser,
  startUrl: string,
  credentials: { username: string; password: string },
): Promise<NavigationResult> {
  const first = await browser.navigate(startUrl);
  if (!first.finalUrl.pathname.startsWith("/login")) return first;
  const form = readLoginForm(first.body);
  return browser.submitForm(`${AUTH_ORIGIN}/login`, {
    rid: form.rid,
    csrf: form.csrf,
    username: credentials.username,
    password: credentials.password,
  });
}

export function visitedPaths(result: NavigationResult): ReadonlyArray<string> {
  return result.history.map((url) => `${url.host}${url.pathname}`);
}
