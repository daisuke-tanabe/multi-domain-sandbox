import { MemoryKeyValueStore } from "@sandbox/shared";
import { beforeEach, describe, expect, test } from "vitest";
import {
  AUTH_HOST,
  Browser,
  createSandbox,
  loginThrough,
  readPageCsrf,
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

describe("E1 first login through tanaka.crm", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
  });

  test("redirects an anonymous user to the auth login page", async () => {
    // Act
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.finalUrl.pathname).toBe("/login");
    expect(result.body).toContain("Sandbox にログイン");
    expect(visitedPaths(result)).toEqual([
      `${TANAKA_CRM_HOST}/projects`,
      `${TANAKA_CRM_HOST}/auth/login`,
      `${AUTH_HOST}/authorize`,
      `${AUTH_HOST}/login`,
    ]);
  });

  test("completes login, lands on the requested page and sets host-scoped cookies only", async () => {
    // Act
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, ALICE);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(TANAKA_CRM_HOST);
    expect(result.finalUrl.pathname).toBe("/projects");
    expect(result.body).toContain("Tanaka Project 1");
    expect(result.body).toContain("role: owner");

    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
    expect(browser.cookies(SUZUKI_CRM_HOST).size).toBe(0);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_pre_auth")).toBe(false);
  });

  test("never exposes a JWT in URLs, cookies or HTML", async () => {
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, ALICE);

    const urls = result.history.map((url) => url.toString()).join("\n");
    const cookies = [
      ...browser.cookies(TANAKA_CRM_HOST).values(),
      ...browser.cookies(AUTH_HOST).values(),
    ].join("\n");
    expect(urls).not.toMatch(JWT_PATTERN);
    expect(cookies).not.toMatch(JWT_PATTERN);
    expect(result.body).not.toMatch(JWT_PATTERN);
  });

  test("E8 shows the login form again with a generic message on wrong password", async () => {
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, {
      username: "alice",
      password: "wrong",
    });

    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.body).toContain("ユーザー名またはパスワードが正しくありません");
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(false);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(false);
  });

  test("E5 shows access denied for a user without membership and keeps the SSO session", async () => {
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, {
      username: "carol",
      password: "carol-password",
    });

    expect(result.response.status).toBe(403);
    expect(result.finalUrl.host).toBe(TANAKA_CRM_HOST);
    expect(result.body).toContain("アクセス権がありません");
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(false);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
  });
});

describe("E2 SSO into suzuki.crm after logging in through tanaka.crm", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, ALICE);
  });

  test("logs into suzuki.crm without showing the login page and with tenant-specific role", async () => {
    // Act
    const result = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/projects`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(SUZUKI_CRM_HOST);
    expect(result.body).toContain("Suzuki Project 1");
    expect(result.body).not.toContain("Tanaka Project 1");
    expect(result.body).toContain("role: viewer");
    expect(visitedPaths(result)).toEqual([
      `${SUZUKI_CRM_HOST}/projects`,
      `${SUZUKI_CRM_HOST}/auth/login`,
      `${AUTH_HOST}/authorize`,
      `${SUZUKI_CRM_HOST}/auth/callback`,
      `${SUZUKI_CRM_HOST}/projects`,
    ]);
    expect(browser.cookies(SUZUKI_CRM_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(TANAKA_CRM_HOST).get("tenant_session")).not.toBe(
      browser.cookies(SUZUKI_CRM_HOST).get("tenant_session"),
    );
  });

  test("E9 revisiting tanaka.crm does not contact the auth server", async () => {
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);

    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toEqual([`${TANAKA_CRM_HOST}/projects`]);
  });

  test("E10 viewer on suzuki cannot create a project while owner on tanaka can", async () => {
    const pageB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/projects`);
    const deniedB = await browser.submitForm(`${SUZUKI_CRM_ORIGIN}/projects`, {
      csrf: readPageCsrf(pageB.body),
      name: "viewer attempt",
    });
    const pageA = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);
    const createdA = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/projects`, {
      csrf: readPageCsrf(pageA.body),
      name: "owner project",
    });

    expect(deniedB.body).toContain("この操作を行う権限がありません");
    expect(deniedB.body).not.toContain("viewer attempt");
    expect(createdA.body).toContain("owner project");
  });
});

describe("E3 tenant logout keeps other tenants and the SSO session", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, ALICE);
    await browser.navigate(`${SUZUKI_CRM_ORIGIN}/projects`);
  });

  test("logs out of tanaka.crm only", async () => {
    // Arrange
    const page = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);

    // Act
    const loggedOut = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, {
      csrf: readPageCsrf(page.body),
    });
    const tenantB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/projects`);

    // Assert
    expect(loggedOut.finalUrl.pathname).toBe("/");
    expect(loggedOut.body).toContain("未ログインです");
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(false);
    expect(browser.cookies(SUZUKI_CRM_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
    expect(tenantB.response.status).toBe(200);
    expect(visitedPaths(tenantB)).toEqual([`${SUZUKI_CRM_HOST}/projects`]);
  });

  test("re-login after tenant logout succeeds without a password because the SSO session remains", async () => {
    const page = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);
    await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, { csrf: readPageCsrf(page.body) });

    const again = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);

    expect(again.response.status).toBe(200);
    expect(visitedPaths(again)).not.toContain(`${AUTH_HOST}/login`);
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
    browser = new Browser(sandbox.dispatch);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, ALICE);
  });

  test("enters tanaka.cms via SSO with a cms audience token and a separate session", async () => {
    // Act
    const result = await browser.navigate(`${TANAKA_CMS_ORIGIN}/projects`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(TANAKA_CMS_HOST);
    expect(result.body).toContain("Tanaka Project 1");
    expect(result.body).toContain("role: owner");
    expect(result.body).toContain("CMS");
    expect(visitedPaths(result)).not.toContain(`${AUTH_HOST}/login`);
    expect(browser.cookies(TANAKA_CMS_HOST).get("tenant_session")).not.toBe(
      browser.cookies(TANAKA_CRM_HOST).get("tenant_session"),
    );
  });

  test("suzuki.cms is refused because suzuki has no cms contract", async () => {
    const result = await browser.navigate(`${SUZUKI_CMS_ORIGIN}/projects`);

    expect(result.response.status).toBe(403);
    expect(result.finalUrl.host).toBe(new URL(SUZUKI_CMS_ORIGIN).host);
    expect(result.body).toContain("suzuki は CMS を契約していません");
    expect(browser.cookies(new URL(SUZUKI_CMS_ORIGIN).host).has("tenant_session")).toBe(false);
    // SSO Session は残る。契約のあるサービスは引き続き使える
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
  });

  test("global logout from crm also ends the cms session through back-channel logout", async () => {
    await browser.navigate(`${TANAKA_CMS_ORIGIN}/projects`);
    const confirm = await browser.navigate(
      `http://${AUTH_HOST}/logout?client_id=crm&tenant=tanaka`,
    );
    await browser.submitForm(`http://${AUTH_HOST}/logout`, {
      csrf: readPageCsrf(confirm.body),
      client_id: "crm",
      tenant: "tanaka",
    });

    const cms = await browser.navigate(`${TANAKA_CMS_ORIGIN}/projects`);

    expect(cms.finalUrl.host).toBe(AUTH_HOST);
    expect(cms.finalUrl.pathname).toBe("/login");
  });
});

describe("session lifetimes", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, ALICE);
  });

  test("E6 recovers silently via SSO after the tenant session idles out", async () => {
    // Arrange: Tenant Session のアイドル 30 分を超え、SSO Session の 2 時間には満たない
    const before = browser.cookies(TANAKA_CRM_HOST).get("tenant_session");
    sandbox.auth.clock.advance(31 * 60);

    // Act
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toContain(`${AUTH_HOST}/authorize`);
    expect(visitedPaths(result)).not.toContain(`${AUTH_HOST}/login`);
    expect(browser.cookies(TANAKA_CRM_HOST).get("tenant_session")).not.toBe(before);
  });

  test("E7 requires a password again after the SSO session idles out", async () => {
    sandbox.auth.clock.advance(2 * 60 * 60 + 1);

    const result = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/projects`);

    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.finalUrl.pathname).toBe("/login");
  });

  test("refreshes the access token transparently before it expires", async () => {
    // Arrange: Access Token 15 分の直前。Tenant Session のアイドル 30 分は超えない
    sandbox.auth.clock.advance(14 * 60 + 30);

    // Act
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toEqual([`${TANAKA_CRM_HOST}/projects`]);
    // 初回交換で 1 件、ローテーションで rotated + 新規の 2 件になる
    const refreshTokens = sandbox.auth.deps.stores.refreshTokens;
    if (!(refreshTokens instanceof MemoryKeyValueStore)) throw new Error("unexpected store");
    expect(refreshTokens.size()).toBe(2);
  });

  test("concurrent requests refresh only once and keep the session alive", async () => {
    // Arrange: 2 タブで同時に開いた状況。Refresh Token は一回限りなので二重に送ってはならない
    sandbox.auth.clock.advance(14 * 60 + 30);

    // Act
    const [first, second] = await Promise.all([
      browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`),
      browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`),
    ]);

    // Assert
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    const refreshTokens = sandbox.auth.deps.stores.refreshTokens;
    if (!(refreshTokens instanceof MemoryKeyValueStore)) throw new Error("unexpected store");
    expect(refreshTokens.size()).toBe(2);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(true);
  });
});

describe("E11 global logout via auth.localhost", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, ALICE);
    await browser.navigate(`${SUZUKI_CRM_ORIGIN}/projects`);
  });

  test("tenant logout page links to global logout for this client", async () => {
    const page = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);
    const loggedOut = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, {
      csrf: readPageCsrf(page.body),
    });

    expect(loggedOut.body).toContain(`http://${AUTH_HOST}/logout?client_id=crm&amp;tenant=tanaka`);
  });

  test("logs out of every tenant at once and requires a password afterwards", async () => {
    // Arrange
    const confirm = await browser.navigate(
      `http://${AUTH_HOST}/logout?client_id=crm&tenant=tanaka`,
    );
    expect(confirm.body).toContain("Sandbox 全体からログアウトしますか");

    // Act
    const done = await browser.submitForm(`http://${AUTH_HOST}/logout`, {
      csrf: readPageCsrf(confirm.body),
      client_id: "crm",
      tenant: "tanaka",
    });
    const tenantA = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);
    const tenantB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/projects`);

    // Assert
    expect(done.body).toContain("Sandbox からログアウトしました");
    expect(done.body).toContain("CRM (tanaka) に戻る");
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(false);
    // Back-Channel Logout でテナント側セッションが消えているため、Cookie があってもログイン画面になる
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
    const stillLoggedIn = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);

    expect(res.status).toBe(400);
    expect(visitedPaths(stillLoggedIn)).toEqual([`${new URL(TANAKA_CRM_ORIGIN).host}/projects`]);
  });
});
