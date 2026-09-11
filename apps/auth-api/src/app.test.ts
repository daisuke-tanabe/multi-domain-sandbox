import { toJwks, verifyJwt } from "@sandbox/shared";
import { beforeEach, describe, expect, test } from "vitest";
import {
  ALICE_ID,
  CRM_AUDIENCE,
  CMS_AUDIENCE,
  SUZUKI_ID,
  TANAKA_CMS_REDIRECT,
  TANAKA_ID,
  authorizeUrl,
  basicAuth,
  cookieHeaderFrom,
  createHarness,
  exchangeCode,
  ISSUER,
  extractCsrf,
  readJson,
  readTokenBody,
  refresh,
  runLoginFlow,
  TANAKA_CRM_REDIRECT,
  SUZUKI_CRM_REDIRECT,
  SUZUKI_CMS_REDIRECT,
  type TestHarness,
} from "./test-support.ts";

const ALICE = { username: "alice", password: "alice-password" };

describe("first login via tenant-a", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  test("redirects to login page when no SSO session exists and does not set SSO cookie yet", async () => {
    // Arrange
    const { url } = authorizeUrl();

    // Act
    const res = await harness.app.request(url);

    // Assert
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/login\?rid=/);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sso_session="))).toBe(false);
  });

  test("issues code, sets host-only SSO cookie and returns tokens on exchange", async () => {
    // Act
    const flow = await runLoginFlow(harness, ALICE);

    // Assert: authorization response
    expect(flow.redirect.origin + flow.redirect.pathname).toBe(TANAKA_CRM_REDIRECT);
    expect(flow.redirect.searchParams.get("state")).toBe("state-1");
    expect(flow.redirect.searchParams.get("iss")).toBe(ISSUER);
    const code = flow.redirect.searchParams.get("code");
    expect(code).not.toBeNull();
    expect(flow.cookie).toMatch(/sso_session=/);

    // Act: code exchange
    const tokenRes = await exchangeCode(harness, {
      code: code ?? "",
      codeVerifier: flow.codeVerifier,
    });
    const body = await readTokenBody(tokenRes);

    // Assert: tokens
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.headers.get("Cache-Control")).toBe("no-store");
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(900);

    const jwks = toJwks([harness.deps.signingKey]);
    const idToken = await verifyJwt(body.id_token, jwks, {
      issuer: ISSUER,
      audience: "crm",
      clock: harness.clock,
    });
    expect(idToken.ok).toBe(true);
    if (!idToken.ok) return;
    expect(idToken.value.sub).toBe(ALICE_ID);
    expect(idToken.value.nonce).toBe("nonce-1");
    expect(idToken.value.tenant_id).toBe(TANAKA_ID);
    expect(idToken.value.tenant_slug).toBe("tanaka");
    expect(idToken.value.email).toBe("alice@example.com");
    expect(typeof idToken.value.sid).toBe("string");

    const accessToken = await verifyJwt(body.access_token, jwks, {
      issuer: ISSUER,
      audience: CRM_AUDIENCE,
      clock: harness.clock,
    });
    expect(accessToken.ok).toBe(true);
    if (!accessToken.ok) return;
    expect(accessToken.value.tenant_id).toBe(TANAKA_ID);
    expect(accessToken.value.role).toBeUndefined();
  });

  test("SSO cookie has HttpOnly, SameSite=Lax, Path=/ and no Domain attribute", async () => {
    const { url } = authorizeUrl();
    const authorizeRes = await harness.app.request(url);
    const loginRes = await harness.app.request(`${ISSUER}${authorizeRes.headers.get("Location")}`);
    const csrf = extractCsrf(await loginRes.text());
    const rid =
      new URL(`${ISSUER}${authorizeRes.headers.get("Location")}`).searchParams.get("rid") ?? "";
    const csrfCookie = loginRes.headers.getSetCookie()[0]?.split(";")[0] ?? "";

    const res = await harness.app.request(`${ISSUER}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
      body: new URLSearchParams({
        rid,
        csrf,
        username: "alice",
        password: "alice-password",
      }).toString(),
    });

    const ssoCookie = res.headers.getSetCookie().find((c) => c.startsWith("sso_session=")) ?? "";
    expect(ssoCookie).toMatch(/HttpOnly/i);
    expect(ssoCookie).toMatch(/SameSite=Lax/i);
    expect(ssoCookie).toMatch(/Path=\//);
    expect(ssoCookie).not.toMatch(/Domain=/i);
  });

  test("re-displays login form with generic message on wrong password and issues no code", async () => {
    const { url } = authorizeUrl();
    const authorizeRes = await harness.app.request(url);
    const loginRes = await harness.app.request(`${ISSUER}${authorizeRes.headers.get("Location")}`);
    const csrf = extractCsrf(await loginRes.text());
    const rid =
      new URL(`${ISSUER}${authorizeRes.headers.get("Location")}`).searchParams.get("rid") ?? "";
    const csrfCookie = loginRes.headers.getSetCookie()[0]?.split(";")[0] ?? "";

    const wrongPassword = await harness.app.request(`${ISSUER}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
      body: new URLSearchParams({ rid, csrf, username: "alice", password: "wrong" }).toString(),
    });
    const wrongPasswordBody = await wrongPassword.text();

    expect(wrongPassword.status).toBe(200);
    expect(wrongPasswordBody).toContain("ユーザー名またはパスワードが正しくありません");
    expect(wrongPassword.headers.getSetCookie().some((c) => c.startsWith("sso_session="))).toBe(
      false,
    );
  });

  test("rejects login POST when csrf token does not match", async () => {
    const { url } = authorizeUrl();
    const authorizeRes = await harness.app.request(url);
    const location = authorizeRes.headers.get("Location") ?? "";
    const loginRes = await harness.app.request(`${ISSUER}${location}`);
    const rid = new URL(`${ISSUER}${location}`).searchParams.get("rid") ?? "";
    const csrfCookie = loginRes.headers.getSetCookie()[0]?.split(";")[0] ?? "";

    const res = await harness.app.request(`${ISSUER}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
      body: new URLSearchParams({
        rid,
        csrf: "forged",
        username: "alice",
        password: "alice-password",
      }).toString(),
    });

    expect(res.status).toBe(403);
  });

  test("returns access_denied to the registered redirect_uri when user has no membership", async () => {
    // carol は Cognito に存在するがどのテナントにも所属しない
    const flow = await runLoginFlow(harness, { username: "carol", password: "carol-password" });

    expect(flow.redirect.origin + flow.redirect.pathname).toBe(TANAKA_CRM_REDIRECT);
    expect(flow.redirect.searchParams.get("error")).toBe("access_denied");
    expect(flow.redirect.searchParams.get("state")).toBe("state-1");
    expect(flow.redirect.searchParams.get("code")).toBeNull();
    // 認証自体は成功しているので SSO Session は作られる
    expect(flow.cookie).toMatch(/sso_session=/);
  });
});

describe("SSO to tenant-b with an existing SSO session", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  test("issues code for tenant-b without showing login page", async () => {
    // Arrange
    const first = await runLoginFlow(harness, ALICE);

    // Act
    const second = await runLoginFlow(
      harness,
      ALICE,
      { clientId: "crm", redirectUri: SUZUKI_CRM_REDIRECT, state: "state-2", nonce: "nonce-2" },
      first.cookie,
    );

    // Assert
    expect(second.redirect.origin + second.redirect.pathname).toBe(SUZUKI_CRM_REDIRECT);
    expect(second.redirect.searchParams.get("code")).not.toBeNull();
    expect(second.redirect.searchParams.get("state")).toBe("state-2");

    const tokenRes = await exchangeCode(harness, {
      code: second.redirect.searchParams.get("code") ?? "",
      codeVerifier: second.codeVerifier,
      clientId: "crm",
      redirectUri: SUZUKI_CRM_REDIRECT,
    });
    expect(tokenRes.status).toBe(200);
    const body = await readTokenBody(tokenRes);
    const idToken = await verifyJwt(body.id_token, toJwks([harness.deps.signingKey]), {
      issuer: ISSUER,
      audience: "crm",
      clock: harness.clock,
    });
    expect(idToken.ok).toBe(true);
    if (!idToken.ok) return;
    expect(idToken.value.tenant_id).toBe(SUZUKI_ID);
  });

  test("returns access_denied for tenant the user does not belong to, keeping SSO session", async () => {
    // bob は tenant-b のみ
    const first = await runLoginFlow(
      harness,
      { username: "bob", password: "bob-password" },
      {
        clientId: "crm",
        redirectUri: SUZUKI_CRM_REDIRECT,
      },
    );
    expect(first.redirect.searchParams.get("code")).not.toBeNull();

    const second = await runLoginFlow(
      harness,
      { username: "bob", password: "bob-password" },
      {},
      first.cookie,
    );

    expect(second.redirect.searchParams.get("error")).toBe("access_denied");
    const session = await harness.deps.stores.ssoSessions.get(
      first.cookie.replace(/.*sso_session=([^;]+).*/, "$1"),
    );
    expect(session).toBeDefined();
  });

  test("requires login again after SSO session idle timeout", async () => {
    const first = await runLoginFlow(harness, ALICE);
    harness.clock.advance(2 * 60 * 60 + 1);

    const { url } = authorizeUrl({ state: "state-3" });
    const res = await harness.app.request(url, { headers: { Cookie: first.cookie } });

    expect(res.headers.get("Location")).toMatch(/^\/login\?rid=/);
  });
});

describe("token endpoint hardening", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  test("rejects code reuse and revokes refresh token issued from the first exchange", async () => {
    // Arrange
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";
    const first = await exchangeCode(harness, { code, codeVerifier: flow.codeVerifier });
    const firstBody = await readTokenBody(first);

    // Act
    const second = await exchangeCode(harness, { code, codeVerifier: flow.codeVerifier });
    const refreshAfterReuse = await refresh(harness, firstBody.refresh_token);

    // Assert
    expect(second.status).toBe(400);
    expect(await second.json()).toEqual({ error: "invalid_grant" });
    expect(refreshAfterReuse.status).toBe(400);
  });

  test("rejects code exchanged by a different client", async () => {
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";

    const res = await exchangeCode(harness, {
      code,
      codeVerifier: flow.codeVerifier,
      clientId: "cms",
    });

    expect(res.status).toBe(400);
  });

  test("rejects wrong code_verifier", async () => {
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";

    const res = await exchangeCode(harness, { code, codeVerifier: "a".repeat(43) });

    expect(res.status).toBe(400);
  });

  test("rejects redirect_uri mismatch on exchange", async () => {
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";

    const res = await exchangeCode(harness, {
      code,
      codeVerifier: flow.codeVerifier,
      redirectUri: SUZUKI_CRM_REDIRECT,
    });

    expect(res.status).toBe(400);
  });

  test("rejects expired code", async () => {
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";
    harness.clock.advance(61);

    const res = await exchangeCode(harness, { code, codeVerifier: flow.codeVerifier });

    expect(res.status).toBe(400);
  });

  test("returns invalid_client for wrong client secret", async () => {
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";

    const res = await exchangeCode(harness, {
      code,
      codeVerifier: flow.codeVerifier,
      secret: "wrong",
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Basic/);
  });

  test("rotates refresh token and revokes the family when an old token is reused", async () => {
    // Arrange
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";
    const initial = await readTokenBody(
      await exchangeCode(harness, { code, codeVerifier: flow.codeVerifier }),
    );

    // Act
    const rotated = await refresh(harness, initial.refresh_token);
    const rotatedBody = await readTokenBody(rotated);
    const reuseOld = await refresh(harness, initial.refresh_token);
    const useNewAfterReuse = await refresh(harness, rotatedBody.refresh_token);

    // Assert
    expect(rotated.status).toBe(200);
    expect(rotatedBody.refresh_token).not.toBe(initial.refresh_token);
    expect(reuseOld.status).toBe(400);
    expect(useNewAfterReuse.status).toBe(400);
  });

  test("refresh fails once SSO session has expired", async () => {
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";
    const initial = await readTokenBody(
      await exchangeCode(harness, { code, codeVerifier: flow.codeVerifier }),
    );
    harness.clock.advance(12 * 60 * 60 + 1);

    const res = await refresh(harness, initial.refresh_token);

    expect(res.status).toBe(400);
  });

  test("revoke endpoint invalidates refresh token and is idempotent", async () => {
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";
    const initial = await readTokenBody(
      await exchangeCode(harness, { code, codeVerifier: flow.codeVerifier }),
    );

    const revokeOnce = await harness.app.request(`${ISSUER}/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuth("crm"),
      },
      body: new URLSearchParams({ token: initial.refresh_token }).toString(),
    });
    const revokeTwice = await harness.app.request(`${ISSUER}/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuth("crm"),
      },
      body: new URLSearchParams({ token: initial.refresh_token }).toString(),
    });
    const refreshRes = await refresh(harness, initial.refresh_token);

    expect(revokeOnce.status).toBe(200);
    expect(revokeTwice.status).toBe(200);
    expect(refreshRes.status).toBe(400);
  });

  test("returns unsupported_grant_type for unknown grant", async () => {
    const res = await harness.app.request(`${ISSUER}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuth("crm"),
      },
      body: new URLSearchParams({ grant_type: "password" }).toString(),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_grant_type" });
  });
});

describe("authorize error handling", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  test("does not redirect when redirect_uri is not registered", async () => {
    const { url } = authorizeUrl({ redirectUri: "http://evil.example/cb" });
    const res = await harness.app.request(url);
    expect(res.status).toBe(400);
    expect(res.headers.get("Location")).toBeNull();
  });

  test("redirects with error for unsupported response_type", async () => {
    const { url } = authorizeUrl();
    const modified = url.replace("response_type=code", "response_type=token");
    const res = await harness.app.request(modified);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location") ?? "");
    expect(location.origin + location.pathname).toBe(TANAKA_CRM_REDIRECT);
    expect(location.searchParams.get("error")).toBe("unsupported_response_type");
    expect(location.searchParams.get("state")).toBe("state-1");
  });
});

describe("discovery and userinfo", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  test("publishes discovery document and JWKS", async () => {
    const discovery = await readJson(
      await harness.app.request(`${ISSUER}/.well-known/openid-configuration`),
    );
    const jwks = await readJson(await harness.app.request(`${ISSUER}/jwks`));

    expect(discovery.issuer).toBe(ISSUER);
    expect(discovery.code_challenge_methods_supported).toEqual(["S256"]);
    expect(jwks.keys).toEqual([expect.objectContaining({ kid: harness.deps.signingKey.kid })]);
    expect(jwks.keys).toEqual([expect.not.objectContaining({ d: expect.anything() })]);
  });

  test("userinfo returns claims for a valid access token and rejects id token", async () => {
    const flow = await runLoginFlow(harness, ALICE);
    const code = flow.redirect.searchParams.get("code") ?? "";
    const tokens = await readTokenBody(
      await exchangeCode(harness, { code, codeVerifier: flow.codeVerifier }),
    );

    const ok = await harness.app.request(`${ISSUER}/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const withIdToken = await harness.app.request(`${ISSUER}/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.id_token}` },
    });

    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      sub: ALICE_ID,
      email: "alice@example.com",
      name: "Alice",
      tenant_id: TANAKA_ID,
    });
    expect(withIdToken.status).toBe(401);
  });
});

describe("global logout", () => {
  test("shows the completion page when no SSO session exists", async () => {
    const harness = await createHarness();

    const res = await harness.app.request(`${ISSUER}/logout?client_id=crm&tenant=tanaka`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("Sandbox からログアウトしました");
    expect(body).toContain("http://tanaka.crm.localhost:3001/");
  });

  test("destroys the SSO session, revokes refresh tokens and notifies every authorized client", async () => {
    // Arrange: tenant-a と tenant-b に code を発行した状態。Back-Channel の送信先を記録する
    const received: Array<{ url: string; logoutToken: string }> = [];
    const harness = await createHarness({
      fetch: async (url, init) => {
        const form = new URLSearchParams(String(init?.body ?? ""));
        received.push({ url: String(url), logoutToken: form.get("logout_token") ?? "" });
        return new Response(null, { status: 200 });
      },
    });
    const first = await runLoginFlow(harness, ALICE);
    const tokens = await readTokenBody(
      await exchangeCode(harness, {
        code: first.redirect.searchParams.get("code") ?? "",
        codeVerifier: first.codeVerifier,
      }),
    );
    await runLoginFlow(
      harness,
      ALICE,
      { clientId: "cms", redirectUri: TANAKA_CMS_REDIRECT, state: "s2", nonce: "n2" },
      first.cookie,
    );

    const confirm = await harness.app.request(`${ISSUER}/logout?client_id=crm&tenant=tanaka`, {
      headers: { Cookie: first.cookie },
    });
    const csrf = extractCsrf(await confirm.text());
    const cookie = cookieHeaderFrom(confirm, first.cookie);

    // Act
    const done = await harness.app.request(`${ISSUER}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: new URLSearchParams({ csrf, client_id: "crm", tenant: "tanaka" }).toString(),
    });
    const afterLogout = await harness.app.request(authorizeUrl({ state: "s3" }).url, {
      headers: { Cookie: cookie },
    });
    const refreshAfterLogout = await refresh(harness, tokens.refresh_token);

    // Assert
    expect(done.status).toBe(200);
    expect(await done.text()).toContain("Sandbox からログアウトしました");
    expect(done.headers.getSetCookie().some((c) => c.startsWith("sso_session=;"))).toBe(true);
    expect(afterLogout.headers.get("Location")).toMatch(/^\/login\?rid=/);
    expect(refreshAfterLogout.status).toBe(400);

    expect(received.map((r) => r.url).toSorted()).toEqual([
      "http://cms.localhost:3003/auth/backchannel-logout",
      "http://crm.localhost:3001/auth/backchannel-logout",
    ]);
    const logoutToken = received.find((r) => r.url.includes("crm."))?.logoutToken ?? "";
    const claims = await verifyJwt(logoutToken, toJwks([harness.deps.signingKey]), {
      issuer: ISSUER,
      audience: "crm",
      clock: harness.clock,
    });
    expect(claims.ok).toBe(true);
    if (!claims.ok) return;
    expect(typeof claims.value.sid).toBe("string");
    expect(claims.value.nonce).toBeUndefined();
    expect(claims.value.events).toEqual({
      "http://schemas.openid.net/event/backchannel-logout": {},
    });
  });

  test("rejects logout POST without a matching csrf token", async () => {
    const harness = await createHarness();
    const first = await runLoginFlow(harness, ALICE);

    const res = await harness.app.request(`${ISSUER}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: first.cookie },
      body: new URLSearchParams({ csrf: "forged" }).toString(),
    });
    const stillLoggedIn = await harness.app.request(authorizeUrl({ state: "s4" }).url, {
      headers: { Cookie: first.cookie },
    });

    expect(res.status).toBe(403);
    expect(stillLoggedIn.headers.get("Location")).toContain("code=");
  });
});

describe("portal", () => {
  test("shows the login form when /login is opened without rid", async () => {
    const harness = await createHarness();

    const res = await harness.app.request(`${ISSUER}/login`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("Sandbox にログイン");
    expect(body).toContain('name="rid" value=""');
  });

  test("reports an expired request when rid is unknown", async () => {
    const harness = await createHarness();

    const res = await harness.app.request(`${ISSUER}/login?rid=unknown`);

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("時間が経ちすぎた");
  });

  test("redirects to the login form when the portal is opened without a session", async () => {
    const harness = await createHarness();

    const res = await harness.app.request(`${ISSUER}/`);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });

  test("logs in without rid and lists the tenants the user belongs to with their roles", async () => {
    // Arrange
    const harness = await createHarness();
    const loginPage = await harness.app.request(`${ISSUER}/login`);
    const csrf = extractCsrf(await loginPage.text());
    const csrfCookie = cookieHeaderFrom(loginPage);

    // Act
    const login = await harness.app.request(`${ISSUER}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
      body: new URLSearchParams({
        rid: "",
        csrf,
        username: "alice",
        password: "alice-password",
      }).toString(),
    });
    const cookie = cookieHeaderFrom(login, csrfCookie);
    const portal = await harness.app.request(`${ISSUER}/`, { headers: { Cookie: cookie } });
    const body = await portal.text();

    // Assert
    expect(login.status).toBe(302);
    expect(login.headers.get("Location")).toBe("/");
    expect(portal.status).toBe(200);
    expect(body).toContain("alice@example.com");
    expect(body).toContain("http://tanaka.crm.localhost:3001/auth/login");
    expect(body).toContain("http://tanaka.cms.localhost:3003/auth/login");
    expect(body).toContain("tanaka / owner");
    expect(body).toContain("http://suzuki.crm.localhost:3001/auth/login");
    expect(body).not.toContain("http://suzuki.cms.localhost:3003/auth/login");
    expect(body).toContain("suzuki / viewer");
  });

  test("tells a user without memberships that no tenant is available", async () => {
    const harness = await createHarness();
    const flow = await runLoginFlow(harness, { username: "carol", password: "carol-password" });

    const portal = await harness.app.request(`${ISSUER}/`, { headers: { Cookie: flow.cookie } });

    expect(await portal.text()).toContain("所属しているテナントがありません");
  });

  test("sends a logged-in user from /login straight to the portal", async () => {
    const harness = await createHarness();
    const flow = await runLoginFlow(harness, ALICE);

    const res = await harness.app.request(`${ISSUER}/login`, { headers: { Cookie: flow.cookie } });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });
});

describe("service and tenant separation", () => {
  test("denies a tenant that has not contracted the service with error_description", async () => {
    const harness = await createHarness();
    // suzuki は cms を契約していない。alice は suzuki の viewer
    const flow = await runLoginFlow(harness, ALICE, {
      clientId: "cms",
      redirectUri: SUZUKI_CMS_REDIRECT,
    });

    expect(flow.redirect.origin + flow.redirect.pathname).toBe(SUZUKI_CMS_REDIRECT);
    expect(flow.redirect.searchParams.get("error")).toBe("access_denied");
    expect(flow.redirect.searchParams.get("error_description")).toBe("not_contracted");
  });

  test("issues access tokens whose audience is the service API, unusable at another service", async () => {
    const harness = await createHarness();
    const flow = await runLoginFlow(harness, ALICE);
    const tokens = await readTokenBody(
      await exchangeCode(harness, {
        code: flow.redirect.searchParams.get("code") ?? "",
        codeVerifier: flow.codeVerifier,
      }),
    );
    const jwks = toJwks([harness.deps.signingKey]);

    const forCrm = await verifyJwt(tokens.access_token, jwks, {
      issuer: ISSUER,
      audience: CRM_AUDIENCE,
      clock: harness.clock,
    });
    const forCms = await verifyJwt(tokens.access_token, jwks, {
      issuer: ISSUER,
      audience: CMS_AUDIENCE,
      clock: harness.clock,
    });

    expect(forCrm.ok).toBe(true);
    expect(forCms.ok).toBe(false);
  });

  test("same user gets tenant-specific tokens for the same service", async () => {
    const harness = await createHarness();
    const tanaka = await runLoginFlow(harness, ALICE);
    const suzuki = await runLoginFlow(
      harness,
      ALICE,
      { redirectUri: SUZUKI_CRM_REDIRECT, state: "s2", nonce: "n2" },
      tanaka.cookie,
    );
    const suzukiTokens = await readTokenBody(
      await exchangeCode(harness, {
        code: suzuki.redirect.searchParams.get("code") ?? "",
        codeVerifier: suzuki.codeVerifier,
        redirectUri: SUZUKI_CRM_REDIRECT,
      }),
    );
    const claims = await verifyJwt(suzukiTokens.access_token, toJwks([harness.deps.signingKey]), {
      issuer: ISSUER,
      audience: CRM_AUDIENCE,
      clock: harness.clock,
    });

    expect(claims.ok).toBe(true);
    if (!claims.ok) return;
    expect(claims.value.tenant_id).toBe(SUZUKI_ID);
    expect(claims.value.tenant_slug).toBe("suzuki");
  });
});
