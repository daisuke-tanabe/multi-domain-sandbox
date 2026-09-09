import {
  AUTH_HOST,
  Browser,
  loginThrough,
  readPageCsrf,
  TENANT_A_ORIGIN,
  TENANT_B_ORIGIN,
  visitedPaths,
} from "../apps/tenant-web/src/test-support.ts";

/**
 * 起動中の 3 サーバーと PostgreSQL に対して、実 HTTP でログインから SSO、Tenant Logout までを通す。
 * 事前に `pnpm db:up` と各アプリの起動が必要。
 */
const dispatch = (url: URL, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, redirect: "manual" });

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, ...(detail !== undefined && { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  (${detail})`}`);
}

const discovery = await fetch(`http://${AUTH_HOST}/.well-known/openid-configuration`);
check("discovery document is served", discovery.status === 200);

const browser = new Browser(dispatch);

const loginPage = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);
check(
  "anonymous access to tenant-a redirects to the auth login page",
  loginPage.finalUrl.host === AUTH_HOST && loginPage.finalUrl.pathname === "/login",
  visitedPaths(loginPage).join(" -> "),
);

const loggedIn = await loginThrough(browser, `${TENANT_A_ORIGIN}/projects`, {
  username: "alice",
  password: "alice-password",
});
check(
  "alice logs in and sees tenant-a projects as owner",
  loggedIn.response.status === 200 &&
    loggedIn.body.includes("Tenant A Project 1") &&
    loggedIn.body.includes("role: owner"),
  `status ${loggedIn.response.status}`,
);

const tenantB = await browser.navigate(`${TENANT_B_ORIGIN}/projects`);
check(
  "tenant-b is entered via SSO without a login page and with viewer role",
  tenantB.response.status === 200 &&
    tenantB.body.includes("Tenant B Project 1") &&
    !tenantB.body.includes("Tenant A Project 1") &&
    tenantB.body.includes("role: viewer") &&
    !visitedPaths(tenantB).includes(`${AUTH_HOST}/login`),
  visitedPaths(tenantB).join(" -> "),
);

const denied = await browser.submitForm(`${TENANT_B_ORIGIN}/projects`, {
  csrf: readPageCsrf(tenantB.body),
  name: "viewer attempt",
});
check(
  "viewer cannot create a project on tenant-b",
  denied.body.includes("この操作を行う権限がありません"),
);

const pageA = await browser.navigate(`${TENANT_A_ORIGIN}/projects`);
const created = await browser.submitForm(`${TENANT_A_ORIGIN}/projects`, {
  csrf: readPageCsrf(pageA.body),
  name: `smoke ${new Date().toISOString()}`,
});
check(
  "owner creates a project on tenant-a through the API and PostgreSQL",
  created.body.includes("smoke "),
);

const loggedOut = await browser.submitForm(`${TENANT_A_ORIGIN}/auth/logout`, {
  csrf: readPageCsrf(created.body),
});
const tenantBAfter = await browser.navigate(`${TENANT_B_ORIGIN}/projects`);
check(
  "tenant logout on tenant-a keeps tenant-b logged in",
  loggedOut.body.includes("未ログインです") && tenantBAfter.response.status === 200,
);

const cookieHosts = [AUTH_HOST, new URL(TENANT_A_ORIGIN).host, new URL(TENANT_B_ORIGIN).host];
const jwtPattern = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./;
const exposed = cookieHosts.some((host) =>
  [...browser.cookies(host).values()].some((v) => jwtPattern.test(v)),
);
check("no JWT is stored in browser cookies", !exposed);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
