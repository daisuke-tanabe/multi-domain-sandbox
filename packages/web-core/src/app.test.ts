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
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.finalUrl.pathname).toBe("/login");
    expect(result.body).toContain("Sandbox にログイン");
    expect(visitedPaths(result)).toEqual([
      `${TANAKA_CRM_HOST}/dashboard`,
      `${TANAKA_CRM_HOST}/auth/login`,
      `${AUTH_HOST}/authorize`,
      `${AUTH_HOST}/login`,
    ]);
  });

  test("completes login, lands on the requested page and sets host-scoped cookies only", async () => {
    // Act
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, ALICE);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(TANAKA_CRM_HOST);
    expect(result.finalUrl.pathname).toBe("/dashboard");
    expect(result.body).toContain("role: owner");

    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
    expect(browser.cookies(SUZUKI_CRM_HOST).size).toBe(0);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_pre_auth")).toBe(false);
  });

  test("never exposes a JWT in URLs, cookies or HTML", async () => {
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, ALICE);

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
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, {
      username: "alice",
      password: "wrong",
    });

    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.body).toContain("ユーザー名またはパスワードが正しくありません");
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(false);
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(false);
  });

  test("E5 shows access denied for a user without membership and keeps the SSO session", async () => {
    const result = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, {
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
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, ALICE);
  });

  test("logs into suzuki.crm without showing the login page and with tenant-specific role", async () => {
    // Act
    const result = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/dashboard`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(SUZUKI_CRM_HOST);
    expect(result.body).toContain("role: viewer");
    expect(visitedPaths(result)).toEqual([
      `${SUZUKI_CRM_HOST}/dashboard`,
      `${SUZUKI_CRM_HOST}/auth/login`,
      `${AUTH_HOST}/authorize`,
      `${SUZUKI_CRM_HOST}/auth/callback`,
      `${SUZUKI_CRM_HOST}/dashboard`,
    ]);
    expect(browser.cookies(SUZUKI_CRM_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(TANAKA_CRM_HOST).get("tenant_session")).not.toBe(
      browser.cookies(SUZUKI_CRM_HOST).get("tenant_session"),
    );
  });

  test("E9 revisiting tanaka.crm does not contact the auth server", async () => {
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);

    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toEqual([`${TANAKA_CRM_HOST}/dashboard`]);
  });

  test("E10 the same user has different permissions per tenant because each service DB decides", async () => {
    const pageB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/dashboard`);
    const pageA = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);

    // suzuki では viewer。作成はできないが unmask は上書きで許可されている
    expect(pageB.body).toContain("role: viewer");
    expect(pageB.body).toMatch(/end_users:create<\/td>\s*<td>no/);
    expect(pageB.body).toMatch(/end_users:unmask<\/td>\s*<td>yes/);
    // tanaka では owner
    expect(pageA.body).toContain("role: owner");
    expect(pageA.body).toMatch(/end_users:create<\/td>\s*<td>yes/);
  });
});

describe("E3 tenant logout keeps other tenants and the SSO session", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, ALICE);
    await browser.navigate(`${SUZUKI_CRM_ORIGIN}/dashboard`);
  });

  test("logs out of tanaka.crm only", async () => {
    // Arrange
    const page = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);

    // Act
    const loggedOut = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, {
      csrf: readPageCsrf(page.body),
    });
    const tenantB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/dashboard`);

    // Assert
    expect(loggedOut.finalUrl.pathname).toBe("/");
    expect(loggedOut.body).toContain("未ログインです");
    expect(browser.cookies(TANAKA_CRM_HOST).has("tenant_session")).toBe(false);
    expect(browser.cookies(SUZUKI_CRM_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
    expect(tenantB.response.status).toBe(200);
    expect(visitedPaths(tenantB)).toEqual([`${SUZUKI_CRM_HOST}/dashboard`]);
  });

  test("re-login after tenant logout succeeds without a password because the SSO session remains", async () => {
    const page = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);
    await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, { csrf: readPageCsrf(page.body) });

    const again = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);

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
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, ALICE);
  });

  test("enters tanaka.cms via SSO with a cms audience token and a separate session", async () => {
    // Act
    const result = await browser.navigate(`${TANAKA_CMS_ORIGIN}/dashboard`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(TANAKA_CMS_HOST);
    expect(result.body).toContain("role: owner");
    expect(result.body).toContain("CMS");
    expect(result.body).toContain("posts:read");
    expect(visitedPaths(result)).not.toContain(`${AUTH_HOST}/login`);
    expect(browser.cookies(TANAKA_CMS_HOST).get("tenant_session")).not.toBe(
      browser.cookies(TANAKA_CRM_HOST).get("tenant_session"),
    );
  });

  test("a service-side deny override removes posts:create from an owner on tanaka.cms", async () => {
    const page = await browser.navigate(`${TANAKA_CMS_ORIGIN}/dashboard`);

    expect(page.body).toContain("role: owner");
    expect(page.body).toMatch(/posts:create<\/td>\s*<td>no/);
    expect(page.body).toMatch(/posts:update<\/td>\s*<td>yes/);
  });

  test("suzuki.cms is refused because suzuki has no cms contract", async () => {
    const result = await browser.navigate(`${SUZUKI_CMS_ORIGIN}/dashboard`);

    expect(result.response.status).toBe(403);
    expect(result.finalUrl.host).toBe(new URL(SUZUKI_CMS_ORIGIN).host);
    expect(result.body).toContain("suzuki は CMS を契約していません");
    expect(browser.cookies(new URL(SUZUKI_CMS_ORIGIN).host).has("tenant_session")).toBe(false);
    // SSO Session は残る。契約のあるサービスは引き続き使える
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
  });

  test("global logout from crm also ends the cms session through back-channel logout", async () => {
    await browser.navigate(`${TANAKA_CMS_ORIGIN}/dashboard`);
    const confirm = await browser.navigate(
      `http://${AUTH_HOST}/logout?client_id=crm&tenant=tanaka`,
    );
    await browser.submitForm(`http://${AUTH_HOST}/logout`, {
      csrf: readPageCsrf(confirm.body),
      client_id: "crm",
      tenant: "tanaka",
    });

    const cms = await browser.navigate(`${TANAKA_CMS_ORIGIN}/dashboard`);

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
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, ALICE);
  });

  test("E6 recovers silently via SSO after the tenant session idles out", async () => {
    // Arrange: Tenant Session のアイドル 30 分を超え、SSO Session の 2 時間には満たない
    const before = browser.cookies(TANAKA_CRM_HOST).get("tenant_session");
    sandbox.auth.clock.advance(31 * 60);

    // Act
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toContain(`${AUTH_HOST}/authorize`);
    expect(visitedPaths(result)).not.toContain(`${AUTH_HOST}/login`);
    expect(browser.cookies(TANAKA_CRM_HOST).get("tenant_session")).not.toBe(before);
  });

  test("E7 requires a password again after the SSO session idles out", async () => {
    sandbox.auth.clock.advance(2 * 60 * 60 + 1);

    const result = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/dashboard`);

    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.finalUrl.pathname).toBe("/login");
  });

  test("refreshes the access token transparently before it expires", async () => {
    // Arrange: Access Token 15 分の直前。Tenant Session のアイドル 30 分は超えない
    sandbox.auth.clock.advance(14 * 60 + 30);

    // Act
    const result = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toEqual([`${TANAKA_CRM_HOST}/dashboard`]);
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
      browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`),
      browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`),
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
    await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, ALICE);
    await browser.navigate(`${SUZUKI_CRM_ORIGIN}/dashboard`);
  });

  test("tenant logout page links to global logout for this client", async () => {
    const page = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);
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
    const tenantA = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);
    const tenantB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/dashboard`);

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
    const stillLoggedIn = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);

    expect(res.status).toBe(400);
    expect(visitedPaths(stillLoggedIn)).toEqual([`${new URL(TANAKA_CRM_ORIGIN).host}/dashboard`]);
  });
});
