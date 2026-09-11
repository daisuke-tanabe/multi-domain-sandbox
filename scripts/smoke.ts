import {
  AUTH_HOST,
  AUTH_ORIGIN,
  Browser,
  loginThrough,
  readJson,
  readSession,
  SEED_USER_PASSWORD,
  SUZUKI_CMS_ORIGIN,
  SUZUKI_CRM_ORIGIN,
  TANAKA_CMS_ORIGIN,
  TANAKA_CRM_ORIGIN,
  visitedPaths,
} from "../packages/web-core/src/test-support.ts";
import { createReporter } from "./check-reporter.ts";

/**
 * 起動中のサーバー群と PostgreSQL に対して、実 HTTP でログインから SSO、Tenant Logout までを通す。
 * SPA が使う /session と /api の JSON 経路をそのまま叩く。事前に `pnpm db:up` と各アプリの起動が必要。
 */
const dispatch = (url: URL, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, redirect: "manual" });

const { check, finish } = createReporter();

const discovery = await fetch(`${AUTH_ORIGIN}/.well-known/openid-configuration`);
check("discovery document is served", discovery.status === 200);

const browser = new Browser(dispatch);

const anonymous = await readSession(browser, TANAKA_CRM_ORIGIN);
const loginPage = await browser.navigate(`${TANAKA_CRM_ORIGIN}/auth/login?return_to=%2F`);
check(
  "anonymous session on tanaka.crm is unauthenticated and /auth/login reaches the auth login page",
  anonymous.authenticated === false &&
    loginPage.finalUrl.host === AUTH_HOST &&
    loginPage.finalUrl.pathname === "/login",
  visitedPaths(loginPage).join(" -> "),
);

const loggedIn = await loginThrough(browser, `${TANAKA_CRM_ORIGIN}/`, {
  username: "alice",
  password: SEED_USER_PASSWORD,
});
const tanakaMe = await readJson(browser, `${TANAKA_CRM_ORIGIN}/api/v1/me`);
const tanakaPermissions = tanakaMe.permissions as string[] | undefined;
check(
  "alice logs in and is owner on tanaka.crm with end_users:create",
  loggedIn.response.status === 200 &&
    tanakaMe.role === "owner" &&
    tanakaPermissions?.includes("end_users:create") === true,
  `status ${loggedIn.response.status}; role ${String(tanakaMe.role)}`,
);

const tenantB = await browser.navigate(`${SUZUKI_CRM_ORIGIN}/auth/login?return_to=%2F`);
const suzukiMe = await readJson(browser, `${SUZUKI_CRM_ORIGIN}/api/v1/me`);
const suzukiPermissions = suzukiMe.permissions as string[] | undefined;
check(
  "suzuki.crm is entered via SSO without a login page and with viewer role",
  tenantB.response.status === 200 &&
    suzukiMe.role === "viewer" &&
    suzukiPermissions?.includes("end_users:create") === false &&
    suzukiPermissions?.includes("end_users:unmask") === true &&
    !visitedPaths(tenantB).includes(`${AUTH_HOST}/login`),
  visitedPaths(tenantB).join(" -> "),
);

const tanakaCms = await browser.navigate(`${TANAKA_CMS_ORIGIN}/auth/login?return_to=%2F`);
const cmsSession = await readSession(browser, TANAKA_CMS_ORIGIN);
const cmsMe = await readJson(browser, `${TANAKA_CMS_ORIGIN}/api/v1/me`);
const cmsPermissions = cmsMe.permissions as string[] | undefined;
check(
  "tanaka.cms (another service) is entered via SSO with its own role vocabulary",
  tanakaCms.response.status === 200 &&
    (cmsSession.service as { name?: string } | undefined)?.name === "CMS" &&
    cmsMe.role === "owner" &&
    !visitedPaths(tanakaCms).includes(`${AUTH_HOST}/login`),
  visitedPaths(tanakaCms).join(" -> "),
);
check(
  "cms denies posts:create for alice through its own permission override",
  cmsPermissions?.includes("posts:create") === false &&
    cmsPermissions?.includes("posts:update") === true,
);

const suzukiCms = await browser.navigate(`${SUZUKI_CMS_ORIGIN}/auth/login?return_to=%2F`);
check(
  "suzuki.cms is refused because suzuki has no cms contract",
  suzukiCms.response.status === 403 && suzukiCms.body.includes("契約していません"),
  `status ${suzukiCms.response.status}`,
);

const tanakaSession = await readSession(browser, TANAKA_CRM_ORIGIN);
const loggedOut = await browser.submitForm(`${TANAKA_CRM_ORIGIN}/auth/logout`, {
  csrf: String(tanakaSession.csrfToken),
});
const tanakaAfter = await readSession(browser, TANAKA_CRM_ORIGIN);
const tenantBAfter = await readSession(browser, SUZUKI_CRM_ORIGIN);
check(
  "tenant logout on tanaka.crm keeps suzuki.crm logged in",
  loggedOut.response.status === 200 &&
    tanakaAfter.authenticated === false &&
    tenantBAfter.authenticated === true,
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
