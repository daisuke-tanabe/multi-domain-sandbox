import { beforeEach, describe, expect, test } from "vitest";
import {
  AUTH_HOST,
  Browser,
  createSandbox,
  loginThrough,
  readJson,
  readSession,
  SUZUKI_CMS_ORIGIN,
  SUZUKI_CRM_ORIGIN,
  TANAKA_CMS_ORIGIN,
  TANAKA_CRM_ORIGIN,
  visitedPaths,
  type SandboxHarness,
} from "./test-support.ts";

const ALICE = { username: "alice", password: "alice-password" };
const TANAKA_CRM_HOST = new URL(TANAKA_CRM_ORIGIN).host;
const SUZUKI_CRM_HOST = new URL(SUZUKI_CRM_ORIGIN).host;
const TANAKA_CMS_HOST = new URL(TANAKA_CMS_ORIGIN).host;

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./;

/** SPA が最初に開く画面。BFF は index.html を返し、SPA が /session と /api を呼ぶ */
const APP_PATH = "/end-users";

/**
 * パスワードや MFA の誤り、SSO Session の期限などログイン画面そのものの振る舞いは auth-api のテストが持つ。
 * ここでは BFF を通した画面遷移、Cookie の分離、テナントとサービスの切り替えを確認する
 */
describe("E1 first login through tanaka.crm", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch, sandbox.auth.clock);
  });

  test("serves the SPA shell to an anonymous user and reports no session", async () => {
    const page = await browser.navigate(`${TANAKA_CRM_ORIGIN}${APP_PATH}`);
    const session = await readSession(browser, TANAKA_CRM_ORIGIN);
    const api = await browser.navigate(`${TANAKA_CRM_ORIGIN}/api/v1/me`);

    expect(page.response.status).toBe(200);
    expect(session.authenticated).toBe(false);
    expect(api.response.status).toBe(401);
  });

  test("/auth/login redirects to the auth login page", async () => {
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/auth/login?return_to=${APP_PATH}`);

    const rid = result.finalUrl.searchParams.get("rid") ?? "";
    const context = await readJson(browser, `http://${AUTH_HOST}/api/login?rid=${rid}`);

    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.finalUrl.pathname).toBe("/login");
    expect(context.rid).toBe(rid);
    expect(typeof context.csrfToken).toBe("string");
    expect(visitedPaths(result)).toEqual([
      `${TANAKA_CRM_HOST}/auth/login`,
      `${AUTH_HOST}/authorize`,
      `${AUTH_HOST}/login`,
    ]);
  });

  test("completes login, returns to the requested SPA path and sets host-scoped cookies only", async () => {
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}${APP_PATH}`, ALICE);
    const session = await readSession(browser, TANAKA_CRM_ORIGIN);
    const me = await readJson(browser, `${TANAKA_CRM_ORIGIN}/api/v1/me`);

    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(TANAKA_CRM_HOST);
    expect(result.finalUrl.pathname).toBe(APP_PATH);
    expect(session.authenticated).toBe(true);
    expect(session.user).toMatchObject({ email: "alice@example.com" });
    expect(me.role).toBe("owner");
    expect(me.permissions).toContain("end_users:create");

    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
    expect(browser.cookies(SUZUKI_CRM_HOST).size).toBe(0);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_pre_auth")).toBe(false);
  });

  test("never exposes a JWT in URLs, cookies, the session endpoint or the API proxy", async () => {
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}${APP_PATH}`, ALICE);
    const session = await browser.navigate(`${TANAKA_CRM_ORIGIN}/session`);
    const me = await browser.navigate(`${TANAKA_CRM_ORIGIN}/api/v1/me`);

    const urls = result.history.map((url) => url.toString()).join("\n");
    const cookies = [
      ...browser.cookies(TANAKA_CRM_HOST).values(),
      ...browser.cookies(AUTH_HOST).values(),
    ].join("\n");
    expect(urls).not.toMatch(JWT_PATTERN);
    expect(cookies).not.toMatch(JWT_PATTERN);
    expect(session.body).not.toMatch(JWT_PATTERN);
    expect(me.body).not.toMatch(JWT_PATTERN);
  });

  test("E5 shows access denied for a user without an assignment and keeps the SSO session", async () => {
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}${APP_PATH}`, {
      username: "carol",
      password: "carol-password",
    });

    expect(result.response.status).toBe(403);
    expect(result.finalUrl.host).toBe(TANAKA_CRM_HOST);
    expect(result.body).toContain("アクセス権がありません");
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(false);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
  });

  test("the callback refuses a forged state and a callback without a pending login", async () => {
    // 認可リクエストを始めてから、state を差し替えた応答を返す
    const started = await browser.fetch(`${TANAKA_CRM_ORIGIN}/auth/login?return_to=${APP_PATH}`);
    const authorizeUrl = new URL(started.headers.get("Location") ?? "");
    const forged = await browser.navigate(
      `${TANAKA_CRM_ORIGIN}/auth/callback?code=x&state=forged&iss=${encodeURIComponent(authorizeUrl.origin)}`,
    );
    // pre_auth は一回限りで消えているので、正しい state を送っても続きはない
    const replayed = await browser.navigate(
      `${TANAKA_CRM_ORIGIN}/auth/callback?code=x&state=${authorizeUrl.searchParams.get("state")}`,
    );

    expect(forged.response.status).toBe(400);
    expect(replayed.response.status).toBe(400);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(false);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_pre_auth")).toBe(false);
  });
});

describe("E2 SSO into suzuki.crm after logging in through tanaka.crm", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch, sandbox.auth.clock);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}${APP_PATH}`, ALICE);
  });

  test("E10 logs into suzuki.crm without the login page, with the role and overrides of that tenant", async () => {
    const result = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/auth/login?return_to=${APP_PATH}`);
    const suzuki = await readJson(browser, `${SUZUKI_CRM_ORIGIN}/api/v1/me`);
    const tanaka = await readJson(browser, `${TANAKA_CRM_ORIGIN}/api/v1/me`);
    const suzukiUsers = await readJson(browser, `${SUZUKI_CRM_ORIGIN}/api/v1/end-users`);

    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(SUZUKI_CRM_HOST);
    expect(visitedPaths(result)).toEqual([
      `${SUZUKI_CRM_HOST}/auth/login`,
      `${AUTH_HOST}/authorize`,
      `${SUZUKI_CRM_HOST}/auth/callback`,
      `${SUZUKI_CRM_HOST}${APP_PATH}`,
    ]);
    expect(browser.cookies(SUZUKI_CRM_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(TANAKA_CRM_HOST).get("tenant_session")).not.toBe(
      browser.cookies(SUZUKI_CRM_HOST).get("tenant_session"),
    );
    // 同じ人でもテナントごとの役割と上書きはそのサービスの DB が決める
    expect(suzuki.role).toBe("viewer");
    expect(suzuki.permissions).not.toContain("end_users:create");
    expect(suzuki.permissions).toContain("end_users:unmask");
    expect(suzukiUsers.masked).toBe(false);
    expect(tanaka.role).toBe("owner");
    expect(tanaka.permissions).toContain("end_users:create");
  });

  test("E9 API calls on tanaka.crm do not contact the auth server", async () => {
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/api/v1/end-users`);

    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toEqual([`${TANAKA_CRM_HOST}/api/v1/end-users`]);
  });

  test("the API proxy requires the CSRF token for writes and forwards JSON bodies", async () => {
    const session = await readSession(browser, TANAKA_CRM_ORIGIN);
    const body = JSON.stringify({ name: "新規", email: "n@example.com", phone: "090-0000-0000" });

    const withoutToken = await browser.fetch(`${TANAKA_CRM_ORIGIN}/api/v1/end-users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const created = await browser.fetch(`${TANAKA_CRM_ORIGIN}/api/v1/end-users`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": String(session.csrfToken) },
      body,
    });

    expect(withoutToken.status).toBe(403);
    expect(created.status).toBe(201);

    const { end_user } = (await created.json()) as { end_user: { id: string } };
    const formBody = await browser.fetch(`${TANAKA_CRM_ORIGIN}/api/v1/end-users/${end_user.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-csrf-token": String(session.csrfToken),
      },
      body: "note=x",
    });
    const deleted = await browser.fetch(`${TANAKA_CRM_ORIGIN}/api/v1/end-users/${end_user.id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": String(session.csrfToken) },
    });

    expect(formBody.status).toBe(415);
    expect(deleted.status).toBe(204);
  });
});

describe("E3 tenant logout keeps other tenants and the SSO session", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch, sandbox.auth.clock);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}${APP_PATH}`, ALICE);
    await browser.navigate(`${SUZUKI_CRM_ORIGIN}/auth/login`);
  });

  test("logs out of tanaka.crm only and gets back in without a password", async () => {
    const session = await readSession(browser, TANAKA_CRM_ORIGIN);

    const loggedOut = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, {
      csrf: String(session.csrfToken),
    });
    const after = await readSession(browser, TANAKA_CRM_ORIGIN);
    const suzuki = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/api/v1/me`);
    const again = await browser.navigate(`${TANAKA_CRM_ORIGIN}/auth/login?return_to=${APP_PATH}`);

    expect(loggedOut.finalUrl.pathname).toBe("/");
    expect(after.authenticated).toBe(false);
    expect(browser.cookies(SUZUKI_CRM_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
    expect(suzuki.response.status).toBe(200);
    // SSO Session が残っているので、再ログインはパスワードなしで済む
    expect(again.response.status).toBe(200);
    expect(visitedPaths(again)).not.toContain(`${AUTH_HOST}/login`);
    expect((await readSession(browser, TANAKA_CRM_ORIGIN)).authenticated).toBe(true);
  });

  test("rejects logout without a matching csrf token", async () => {
    const result = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, { csrf: "forged" });

    expect(result.response.status).toBe(403);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(true);
  });
});

describe("E12 services share the SSO session but contracts gate access", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch, sandbox.auth.clock);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}${APP_PATH}`, ALICE);
  });

  test("enters tanaka.cms via SSO with its own session, role and deny override", async () => {
    const result = await browser.navigate(`${TANAKA_CMS_ORIGIN}/auth/login?return_to=/posts`);
    const me = await readJson(browser, `${TANAKA_CMS_ORIGIN}/api/v1/me`);
    const session = await readSession(browser, TANAKA_CMS_ORIGIN);
    const created = await browser.fetch(`${TANAKA_CMS_ORIGIN}/api/v1/posts`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": String(session.csrfToken) },
      body: JSON.stringify({ title: "t", body: "b" }),
    });

    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(TANAKA_CMS_HOST);
    expect(visitedPaths(result)).not.toContain(`${AUTH_HOST}/login`);
    expect(browser.cookies(TANAKA_CMS_HOST).get("tenant_session")).not.toBe(
      browser.cookies(TANAKA_CRM_HOST).get("tenant_session"),
    );
    // cms の DB では owner だが posts:create を deny している
    expect(me.role).toBe("owner");
    expect(me.permissions).toContain("posts:update");
    expect(me.permissions).not.toContain("posts:create");
    expect(created.status).toBe(403);
  });

  test("suzuki.cms is refused because suzuki has no cms contract", async () => {
    const result = await browser.navigate(`${SUZUKI_CMS_ORIGIN}/auth/login`);

    expect(result.response.status).toBe(403);
    expect(result.finalUrl.host).toBe(new URL(SUZUKI_CMS_ORIGIN).host);
    expect(result.body).toContain("suzuki は CMS を契約していません");
    expect(browser.cookies(new URL(SUZUKI_CMS_ORIGIN).host).has("tenant_session")).toBe(false);
    // SSO Session は残る。契約のあるサービスは引き続き使える
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
  });
});

describe("session lifetimes", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch, sandbox.auth.clock);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}${APP_PATH}`, ALICE);
  });

  test("E6 the SPA can recover via SSO after the tenant session idles out", async () => {
    // Arrange: Tenant Session のアイドル 30 分を超え、SSO Session の 2 時間には満たない
    const before = browser.cookies(TANAKA_CRM_HOST).get("tenant_session");
    sandbox.auth.clock.advance(31 * 60);

    const expired = await readSession(browser, TANAKA_CRM_ORIGIN);
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/auth/login?return_to=${APP_PATH}`);

    expect(expired.authenticated).toBe(false);
    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toContain(`${AUTH_HOST}/authorize`);
    expect(visitedPaths(result)).not.toContain(`${AUTH_HOST}/login`);
    expect(browser.cookies(TANAKA_CRM_HOST).get("tenant_session")).not.toBe(before);
  });

  test("concurrent API calls near token expiry refresh once, transparently, and keep the session", async () => {
    // Arrange: Access Token 15 分の直前。Tenant Session のアイドル 30 分は超えない
    sandbox.auth.clock.advance(14 * 60 + 30);

    const [first, second] = await Promise.all([
      browser.navigate(`${TANAKA_CRM_ORIGIN}/api/v1/me`),
      browser.navigate(`${TANAKA_CRM_ORIGIN}/api/v1/end-users`),
    ]);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(sandbox.tokenGrants).toEqual(["authorization_code", "refresh_token"]);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(true);
  });
});

describe("E11 global logout via auth.localhost", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch, sandbox.auth.clock);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}${APP_PATH}`, ALICE);
    await browser.navigate(`${SUZUKI_CRM_ORIGIN}/auth/login`);
    await browser.navigate(`${TANAKA_CMS_ORIGIN}/auth/login`);
  });

  test("logs out of every tenant and service at once and requires a password afterwards", async () => {
    const session = await readSession(browser, TANAKA_CRM_ORIGIN);
    const globalLogout = (session.urls as { globalLogout: string }).globalLogout;
    const confirm = await readJson(browser, globalLogout.replace("/logout", "/api/logout"));

    const done = await browser.submitForm(`http://${AUTH_HOST}/logout`, {
      csrf: String(confirm.csrfToken),
      client_id: "crm",
      tenant: "tanaka",
    });
    const after = await readJson(browser, globalLogout.replace("/logout", "/api/logout"));
    const cms = await readSession(browser, TANAKA_CMS_ORIGIN);
    const tenantA = await browser.navigate(`${TANAKA_CRM_ORIGIN}/auth/login`);
    const tenantB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/auth/login`);

    expect(globalLogout).toBe(`http://${AUTH_HOST}/logout?client_id=crm&tenant=tanaka`);
    expect(confirm.authenticated).toBe(true);
    expect(done.finalUrl.pathname).toBe("/logout");
    expect(after.authenticated).toBe(false);
    expect(after.returnTo).toEqual({ label: "CRM (tanaka)", href: `${TANAKA_CRM_ORIGIN}/` });
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(false);
    // Back-Channel Logout でテナント側セッションが消えているため、Cookie があってもログイン画面になる
    expect(cms.authenticated).toBe(false);
    expect(tenantA.finalUrl.host).toBe(AUTH_HOST);
    expect(tenantA.finalUrl.pathname).toBe("/login");
    expect(tenantB.finalUrl.host).toBe(AUTH_HOST);
    expect(tenantB.finalUrl.pathname).toBe("/login");
  });

  test("backchannel logout endpoint rejects a forged token", async () => {
    const res = await sandbox.dispatch(new URL(`${TANAKA_CRM_ORIGIN}/auth/backchannel-logout`), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ logout_token: "forged" }).toString(),
    });
    const stillLoggedIn = await readSession(browser, TANAKA_CRM_ORIGIN);

    expect(res.status).toBe(400);
    expect(stillLoggedIn.authenticated).toBe(true);
  });
});
