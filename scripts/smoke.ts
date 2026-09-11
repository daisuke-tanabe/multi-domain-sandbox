import {
  AUTH_HOST,
  AUTH_ORIGIN,
  Browser,
  loginThrough,
  readPageCsrf,
  SEED_USER_PASSWORD,
  SUZUKI_CMS_ORIGIN,
  SUZUKI_CRM_ORIGIN,
  TANAKA_CMS_ORIGIN,
  TANAKA_CRM_ORIGIN,
  visitedPaths,
} from "../packages/bff/src/test-support.ts";
import { createReporter } from "./check-reporter.ts";

/**
 * 起動中の 3 サーバーと PostgreSQL に対して、実 HTTP でログインから SSO、Tenant Logout までを通す。
 * 事前に `pnpm db:up` と各アプリの起動が必要。
 */
const dispatch = (url: URL, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, redirect: "manual" });

const { check, finish } = createReporter();

const discovery = await fetch(`${AUTH_ORIGIN}/.well-known/openid-configuration`);
check("discovery document is served", discovery.status === 200);

const browser = new Browser(dispatch);

const loginPage = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);
check(
  "anonymous access to tanaka.crm redirects to the auth login page",
  loginPage.finalUrl.host === AUTH_HOST && loginPage.finalUrl.pathname === "/login",
  visitedPaths(loginPage).join(" -> "),
);

const loggedIn = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/projects`, {
  username: "alice",
  password: SEED_USER_PASSWORD,
});
check(
  "alice logs in and sees tanaka projects on crm as owner",
  loggedIn.response.status === 200 &&
    loggedIn.body.includes("Tanaka Project 1") &&
    loggedIn.body.includes("role: owner"),
  `status ${loggedIn.response.status}`,
);

const tenantB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/projects`);
check(
  "suzuki.crm is entered via SSO without a login page and with viewer role",
  tenantB.response.status === 200 &&
    tenantB.body.includes("Suzuki Project 1") &&
    !tenantB.body.includes("Tanaka Project 1") &&
    tenantB.body.includes("role: viewer") &&
    !visitedPaths(tenantB).includes(`${AUTH_HOST}/login`),
  visitedPaths(tenantB).join(" -> "),
);

const denied = await browser.submitForm(`${SUZUKI_CRM_ORIGIN}/projects`, {
  csrf: readPageCsrf(tenantB.body),
  name: "viewer attempt",
});
check(
  "viewer cannot create a project on suzuki.crm",
  denied.body.includes("この操作を行う権限がありません"),
);

const pageA = await browser.navigate(`${TANAKA_CRM_ORIGIN}/projects`);
const created = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/projects`, {
  csrf: readPageCsrf(pageA.body),
  name: `smoke ${new Date().toISOString()}`,
});
check(
  "owner creates a project on tanaka.crm through the API and PostgreSQL",
  created.body.includes("smoke "),
);

const tanakaCms = await browser.navigate(`${TANAKA_CMS_ORIGIN}/projects`);
check(
  "tanaka.cms (another service) is entered via SSO and shows the same tenant data",
  tanakaCms.response.status === 200 &&
    tanakaCms.body.includes("Tanaka Project 1") &&
    tanakaCms.body.includes("CMS") &&
    !visitedPaths(tanakaCms).includes(`${AUTH_HOST}/login`),
  visitedPaths(tanakaCms).join(" -> "),
);

const suzukiCms = await browser.navigate(`${SUZUKI_CMS_ORIGIN}/projects`);
check(
  "suzuki.cms is refused because suzuki has no cms contract",
  suzukiCms.response.status === 403 && suzukiCms.body.includes("契約していません"),
  `status ${suzukiCms.response.status}`,
);

const loggedOut = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, {
  csrf: readPageCsrf(created.body),
});
const tenantBAfter = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/projects`);
check(
  "tenant logout on tanaka.crm keeps suzuki.crm logged in",
  loggedOut.body.includes("未ログインです") && tenantBAfter.response.status === 200,
);

const cookieHosts = [
  AUTH_HOST,
  new URL(TANAKA_CRM_ORIGIN).host,
  new URL(SUZUKI_CRM_ORIGIN).host,
  new URL(TANAKA_CMS_ORIGIN).host,
];
const jwtPattern = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./;
const exposed = cookieHosts.some((host) =>
  [...browser.cookies(host).values()].some((v) => jwtPattern.test(v)),
);
check("no JWT is stored in browser cookies", !exposed);

finish();
