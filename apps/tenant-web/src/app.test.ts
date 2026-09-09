import { MemoryKeyValueStore } from "@sandbox/shared";
import { beforeEach, describe, expect, test } from "vitest";
import {
  AUTH_HOST,
  Browser,
  createSandbox,
  loginThrough,
  readPageCsrf,
  TENANT_A_ORIGIN,
  TENANT_B_ORIGIN,
  visitedPaths,
  type SandboxHarness,
} from "./test-support.ts";

const ALICE = { username: "alice", password: "alice-password" };
const TENANT_A_HOST = new URL(TENANT_A_ORIGIN).host;
const TENANT_B_HOST = new URL(TENANT_B_ORIGIN).host;

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./;

describe("E1 first login through tenant-a", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
  });

  test("redirects an anonymous user to the auth login page", async () => {
    // Act
    const result = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.finalUrl.pathname).toBe("/login");
    expect(result.body).toContain("Sandbox にログイン");
    expect(visitedPaths(result)).toEqual([
      `${TENANT_A_HOST}/projects`,
      `${TENANT_A_HOST}/auth/login`,
      `${AUTH_HOST}/authorize`,
      `${AUTH_HOST}/login`,
    ]);
  });

  test("completes login, lands on the requested page and sets host-scoped cookies only", async () => {
    // Act
    const result = await loginThrough(browser, `${TENANT_A_ORIGIN}/projects`, ALICE);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(TENANT_A_HOST);
    expect(result.finalUrl.pathname).toBe("/projects");
    expect(result.body).toContain("Tenant A Project 1");
    expect(result.body).toContain("role: owner");

    expect(browser.cookies(TENANT_A_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
    expect(browser.cookies(TENANT_B_HOST).size).toBe(0);
    expect(browser.cookies(TENANT_A_HOST).has("tenant_pre_auth")).toBe(false);
  });

  test("never exposes a JWT in URLs, cookies or HTML", async () => {
    const result = await loginThrough(browser, `${TENANT_A_ORIGIN}/projects`, ALICE);

    const urls = result.history.map((url) => url.toString()).join("\n");
    const cookies = [
      ...browser.cookies(TENANT_A_HOST).values(),
      ...browser.cookies(AUTH_HOST).values(),
    ].join("\n");
    expect(urls).not.toMatch(JWT_PATTERN);
    expect(cookies).not.toMatch(JWT_PATTERN);
    expect(result.body).not.toMatch(JWT_PATTERN);
  });

  test("E8 shows the login form again with a generic message on wrong password", async () => {
    const result = await loginThrough(browser, `${TENANT_A_ORIGIN}/projects`, {
      username: "alice",
      password: "wrong",
    });

    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.body).toContain("ユーザー名またはパスワードが正しくありません");
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(false);
    expect(browser.cookies(TENANT_A_HOST).has("tenant_session")).toBe(false);
  });

  test("E5 shows access denied for a user without membership and keeps the SSO session", async () => {
    const result = await loginThrough(browser, `${TENANT_A_ORIGIN}/projects`, {
      username: "carol",
      password: "carol-password",
    });

    expect(result.response.status).toBe(403);
    expect(result.finalUrl.host).toBe(TENANT_A_HOST);
    expect(result.body).toContain("アクセス権がありません");
    expect(browser.cookies(TENANT_A_HOST).has("tenant_session")).toBe(false);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
  });
});

describe("E2 SSO into tenant-b after logging in through tenant-a", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
    await loginThrough(browser, `${TENANT_A_ORIGIN}/projects`, ALICE);
  });

  test("logs into tenant-b without showing the login page and with tenant-specific role", async () => {
    // Act
    const result = await browser.navigate(`${TENANT_B_ORIGIN}/projects`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(result.finalUrl.host).toBe(TENANT_B_HOST);
    expect(result.body).toContain("Tenant B Project 1");
    expect(result.body).not.toContain("Tenant A Project 1");
    expect(result.body).toContain("role: viewer");
    expect(visitedPaths(result)).toEqual([
      `${TENANT_B_HOST}/projects`,
      `${TENANT_B_HOST}/auth/login`,
      `${AUTH_HOST}/authorize`,
      `${TENANT_B_HOST}/auth/callback`,
      `${TENANT_B_HOST}/projects`,
    ]);
    expect(browser.cookies(TENANT_B_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(TENANT_A_HOST).get("tenant_session")).not.toBe(
      browser.cookies(TENANT_B_HOST).get("tenant_session"),
    );
  });

  test("E9 revisiting tenant-a does not contact the auth server", async () => {
    const result = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);

    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toEqual([`${TENANT_A_HOST}/projects`]);
  });

  test("E10 viewer on tenant-b cannot create a project while owner on tenant-a can", async () => {
    const pageB = await browser.navigate(`${TENANT_B_ORIGIN}/projects`);
    const deniedB = await browser.submitForm(`${TENANT_B_ORIGIN}/projects`, {
      csrf: readPageCsrf(pageB.body),
      name: "viewer attempt",
    });
    const pageA = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);
    const createdA = await browser.submitForm(`${TENANT_A_ORIGIN}/projects`, {
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
    await loginThrough(browser, `${TENANT_A_ORIGIN}/projects`, ALICE);
    await browser.navigate(`${TENANT_B_ORIGIN}/projects`);
  });

  test("logs out of tenant-a only", async () => {
    // Arrange
    const page = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);

    // Act
    const loggedOut = await browser.submitForm(`${TENANT_A_ORIGIN}/auth/logout`, {
      csrf: readPageCsrf(page.body),
    });
    const tenantB = await browser.navigate(`${TENANT_B_ORIGIN}/projects`);

    // Assert
    expect(loggedOut.finalUrl.pathname).toBe("/");
    expect(loggedOut.body).toContain("未ログインです");
    expect(browser.cookies(TENANT_A_HOST).has("tenant_session")).toBe(false);
    expect(browser.cookies(TENANT_B_HOST).has("tenant_session")).toBe(true);
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(true);
    expect(tenantB.response.status).toBe(200);
    expect(visitedPaths(tenantB)).toEqual([`${TENANT_B_HOST}/projects`]);
  });

  test("re-login after tenant logout succeeds without a password because the SSO session remains", async () => {
    const page = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);
    await browser.submitForm(`${TENANT_A_ORIGIN}/auth/logout`, { csrf: readPageCsrf(page.body) });

    const again = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);

    expect(again.response.status).toBe(200);
    expect(visitedPaths(again)).not.toContain(`${AUTH_HOST}/login`);
  });

  test("rejects logout without a matching csrf token", async () => {
    const result = await browser.submitForm(`${TENANT_A_ORIGIN}/auth/logout`, { csrf: "forged" });

    expect(result.response.status).toBe(403);
    expect(browser.cookies(TENANT_A_HOST).has("tenant_session")).toBe(true);
  });
});

describe("session lifetimes", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
    await loginThrough(browser, `${TENANT_A_ORIGIN}/projects`, ALICE);
  });

  test("E6 recovers silently via SSO after the tenant session idles out", async () => {
    // Arrange: Tenant Session のアイドル 30 分を超え、SSO Session の 2 時間には満たない
    const before = browser.cookies(TENANT_A_HOST).get("tenant_session");
    sandbox.auth.clock.advance(31 * 60);

    // Act
    const result = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toContain(`${AUTH_HOST}/authorize`);
    expect(visitedPaths(result)).not.toContain(`${AUTH_HOST}/login`);
    expect(browser.cookies(TENANT_A_HOST).get("tenant_session")).not.toBe(before);
  });

  test("E7 requires a password again after the SSO session idles out", async () => {
    sandbox.auth.clock.advance(2 * 60 * 60 + 1);

    const result = await browser.navigate(`${TENANT_B_ORIGIN}/projects`);

    expect(result.finalUrl.host).toBe(AUTH_HOST);
    expect(result.finalUrl.pathname).toBe("/login");
  });

  test("refreshes the access token transparently before it expires", async () => {
    // Arrange: Access Token 15 分の直前。Tenant Session のアイドル 30 分は超えない
    sandbox.auth.clock.advance(14 * 60 + 30);

    // Act
    const result = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);

    // Assert
    expect(result.response.status).toBe(200);
    expect(visitedPaths(result)).toEqual([`${TENANT_A_HOST}/projects`]);
    // 初回交換で 1 件、ローテーションで rotated + 新規の 2 件になる
    const refreshTokens = sandbox.auth.deps.stores.refreshTokens;
    if (!(refreshTokens instanceof MemoryKeyValueStore)) throw new Error("unexpected store");
    expect(refreshTokens.size()).toBe(2);
  });
});

describe("E11 global logout via auth.localhost", () => {
  let sandbox: SandboxHarness;
  let browser: Browser;

  beforeEach(async () => {
    sandbox = await createSandbox();
    browser = new Browser(sandbox.dispatch);
    await loginThrough(browser, `${TENANT_A_ORIGIN}/projects`, ALICE);
    await browser.navigate(`${TENANT_B_ORIGIN}/projects`);
  });

  test("tenant logout page links to global logout for this client", async () => {
    const page = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);
    const loggedOut = await browser.submitForm(`${TENANT_A_ORIGIN}/auth/logout`, {
      csrf: readPageCsrf(page.body),
    });

    expect(loggedOut.body).toContain(`http://${AUTH_HOST}/logout?client_id=tenant-a`);
  });

  test("logs out of every tenant at once and requires a password afterwards", async () => {
    // Arrange
    const confirm = await browser.navigate(`http://${AUTH_HOST}/logout?client_id=tenant-a`);
    expect(confirm.body).toContain("Sandbox 全体からログアウトしますか");

    // Act
    const done = await browser.submitForm(`http://${AUTH_HOST}/logout`, {
      csrf: readPageCsrf(confirm.body),
      client_id: "tenant-a",
    });
    const tenantA = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);
    const tenantB = await browser.navigate(`${TENANT_B_ORIGIN}/projects`);

    // Assert
    expect(done.body).toContain("Sandbox からログアウトしました");
    expect(done.body).toContain("tenant-a に戻る");
    expect(browser.cookies(AUTH_HOST).has("sso_session")).toBe(false);
    // Back-Channel Logout でテナント側セッションが消えているため、Cookie があってもログイン画面になる
    expect(tenantA.finalUrl.host).toBe(AUTH_HOST);
    expect(tenantA.finalUrl.pathname).toBe("/login");
    expect(tenantB.finalUrl.host).toBe(AUTH_HOST);
    expect(tenantB.finalUrl.pathname).toBe("/login");
  });

  test("backchannel logout endpoint rejects a forged token", async () => {
    const res = await sandbox.dispatch(new URL(`${TENANT_A_ORIGIN}/auth/backchannel-logout`), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ logout_token: "forged" }).toString(),
    });
    const stillLoggedIn = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);

    expect(res.status).toBe(400);
    expect(visitedPaths(stillLoggedIn)).toEqual([`${new URL(TENANT_A_ORIGIN).host}/projects`]);
  });
});
