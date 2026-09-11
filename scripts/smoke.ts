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
} from "../packages/web-core/src/test-support.ts";
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

const loginPage = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);
check(
  "anonymous access to tanaka.crm redirects to the auth login page",
  loginPage.finalUrl.host === AUTH_HOST && loginPage.finalUrl.pathname === "/login",
  visitedPaths(loginPage).join(" -> "),
);

const loggedIn = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/dashboard`, {
  username: "alice",
  password: SEED_USER_PASSWORD,
});
check(
  "alice logs in and is owner on tanaka.crm with end_users:create",
  loggedIn.response.status === 200 &&
    loggedIn.body.includes("role: owner") &&
    /end_users:create<\/td>\s*<td>yes/.test(loggedIn.body),
  `status ${loggedIn.response.status}`,
);

const tenantB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/dashboard`);
check(
  "suzuki.crm is entered via SSO without a login page and with viewer role",
  tenantB.response.status === 200 &&
    tenantB.body.includes("role: viewer") &&
    /end_users:create<\/td>\s*<td>no/.test(tenantB.body) &&
    !visitedPaths(tenantB).includes(`${AUTH_HOST}/login`),
  visitedPaths(tenantB).join(" -> "),
);

const tanakaCms = await browser.navigate(`${TANAKA_CMS_ORIGIN}/dashboard`);
check(
  "tanaka.cms (another service) is entered via SSO with its own role vocabulary",
  tanakaCms.response.status === 200 &&
    tanakaCms.body.includes("CMS") &&
    tanakaCms.body.includes("role: owner") &&
    !visitedPaths(tanakaCms).includes(`${AUTH_HOST}/login`),
  visitedPaths(tanakaCms).join(" -> "),
);
check(
  "cms denies posts:create for alice through its own permission override",
  /posts:create<\/td>\s*<td>no/.test(tanakaCms.body) &&
    /posts:update<\/td>\s*<td>yes/.test(tanakaCms.body),
);

const suzukiCms = await browser.navigate(`${SUZUKI_CMS_ORIGIN}/dashboard`);
check(
  "suzuki.cms is refused because suzuki has no cms contract",
  suzukiCms.response.status === 403 && suzukiCms.body.includes("契約していません"),
  `status ${suzukiCms.response.status}`,
);

const pageA = await browser.navigate(`${TANAKA_CRM_ORIGIN}/dashboard`);
const loggedOut = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, {
  csrf: readPageCsrf(pageA.body),
});
const tenantBAfter = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/dashboard`);
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
