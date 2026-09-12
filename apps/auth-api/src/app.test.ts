import { generateTotp, keyDigest, toJwks, verifyJwt, MemoryKeyValueStore } from "@sandbox/shared";
import { beforeEach, describe, expect, test } from "vitest";
import {
  MOCK_TOTP_SECRETS,
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
  completeMfa,
  readLoginContext,
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
    const rid =
      new URL(`${ISSUER}${authorizeRes.headers.get("Location")}`).searchParams.get("rid") ?? "";
    const { csrf, cookie: csrfCookie } = await readLoginContext(harness, rid);

    const passwordRes = await harness.app.request(`${ISSUER}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
      body: new URLSearchParams({
        rid,
        csrf,
        username: "alice",
        password: "alice-password",
      }).toString(),
    });
    // パスワードだけでは SSO Cookie は出ない。認証アプリのコードを通してから出る
    const { response: res } = await completeMfa(harness, passwordRes, csrfCookie, "alice");

    expect(passwordRes.headers.get("Location")).toMatch(/^\/login\/challenge\?mid=/);
    expect(passwordRes.headers.getSetCookie().some((c) => c.startsWith("sso_session="))).toBe(
      false,
    );
    const ssoCookie = res.headers.getSetCookie().find((c) => c.startsWith("sso_session=")) ?? "";
    expect(ssoCookie).toMatch(/HttpOnly/i);
    expect(ssoCookie).toMatch(/SameSite=Lax/i);
    expect(ssoCookie).toMatch(/Path=\//);
    expect(ssoCookie).not.toMatch(/Domain=/i);
  });

  test("sends the user back to the login screen with a generic message on wrong password and issues no code", async () => {
    const { url } = authorizeUrl();
    const authorizeRes = await harness.app.request(url);
    const rid =
      new URL(`${ISSUER}${authorizeRes.headers.get("Location")}`).searchParams.get("rid") ?? "";
    const { csrf, cookie: csrfCookie } = await readLoginContext(harness, rid);

    const wrongPassword = await harness.app.request(`${ISSUER}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
      body: new URLSearchParams({ rid, csrf, username: "alice", password: "wrong" }).toString(),
    });
    const retryLocation = wrongPassword.headers.get("Location") ?? "";
    const retry = await harness.app.request(
      `${ISSUER}${retryLocation}`.replace("/login?", "/api/login?"),
    );

    expect(wrongPassword.status).toBe(303);
    expect(retryLocation).toBe(`/login?error=invalid_credentials&rid=${encodeURIComponent(rid)}`);
    expect((await readJson(retry)).errorMessage).toBe(
      "ユーザー名またはパスワードが正しくありません",
    );
    expect(wrongPassword.headers.getSetCookie().some((c) => c.startsWith("sso_session="))).toBe(
      false,
    );
  });

  test("rejects login POST when csrf token does not match", async () => {
    const { url } = authorizeUrl();
    const authorizeRes = await harness.app.request(url);
    const location = authorizeRes.headers.get("Location") ?? "";
    const rid = new URL(`${ISSUER}${location}`).searchParams.get("rid") ?? "";
    const { cookie: csrfCookie } = await readLoginContext(harness, rid);

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
    const rawCookie = first.cookie.replace(/.*sso_session=([^;]+).*/, "$1");
    // ストアのキーは Cookie の値の SHA-256。生の値ではストアを引けない
    expect(await harness.deps.stores.ssoSessions.get(rawCookie)).toBeUndefined();
    expect(await harness.deps.stores.ssoSessions.get(keyDigest(rawCookie))).toBeDefined();
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
  test("reports the logged-out state with a return link when no SSO session exists", async () => {
    const harness = await createHarness();

    const res = await harness.app.request(`${ISSUER}/api/logout?client_id=crm&tenant=tanaka`);
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.authenticated).toBe(false);
    expect(body.returnTo).toEqual({
      label: "CRM (tanaka)",
      href: "http://tanaka.crm.localhost:3001/",
    });
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

    const confirm = await harness.app.request(`${ISSUER}/api/logout?client_id=crm&tenant=tanaka`, {
      headers: { Cookie: first.cookie },
    });
    const confirmBody = await readJson(confirm);
    const csrf = String(confirmBody.csrfToken);
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

    const afterState = await readJson(
      await harness.app.request(`${ISSUER}/api/logout?client_id=crm&tenant=tanaka`, {
        headers: { Cookie: cookieHeaderFrom(done, cookie) },
      }),
    );

    // Assert
    expect(confirmBody.authenticated).toBe(true);
    expect(done.status).toBe(303);
    expect(done.headers.get("Location")).toBe("/logout?client_id=crm&tenant=tanaka");
    expect(afterState.authenticated).toBe(false);
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
  test("gives the SPA an empty rid and a csrf token when /api/login is called without rid", async () => {
    const harness = await createHarness();

    const { response, body } = await readLoginContext(harness, "");

    expect(response.status).toBe(200);
    expect(body.rid).toBe("");
    expect(typeof body.csrfToken).toBe("string");
    expect(response.headers.getSetCookie().some((c) => c.startsWith("auth_csrf="))).toBe(true);
  });

  test("reports an expired request when rid is unknown", async () => {
    const harness = await createHarness();

    const { response, body } = await readLoginContext(harness, "unknown");

    expect(response.status).toBe(400);
    expect(body.error).toBe("expired_request");
    expect(String(body.message)).toContain("時間が経ちすぎた");
  });

  test("answers 401 to the portal API without a session so the SPA shows the login screen", async () => {
    const harness = await createHarness();

    const res = await harness.app.request(`${ISSUER}/api/portal`);

    expect(res.status).toBe(401);
  });

  test("serves the SPA shell for the screen paths", async () => {
    const harness = await createHarness();

    const statuses = await Promise.all(
      ["/", "/login", "/logout"].map(
        async (path) => (await harness.app.request(`${ISSUER}${path}`)).status,
      ),
    );

    expect(statuses).toEqual([200, 200, 200]);
  });

  test("logs in without rid and lists the assigned services per tenant", async () => {
    // Arrange
    const harness = await createHarness();
    const { csrf, cookie: csrfCookie } = await readLoginContext(harness, "");

    // Act
    const passwordRes = await harness.app.request(`${ISSUER}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
      body: new URLSearchParams({
        rid: "",
        csrf,
        username: "alice",
        password: "alice-password",
      }).toString(),
    });
    const { response: login, cookie } = await completeMfa(
      harness,
      passwordRes,
      csrfCookie,
      "alice",
    );
    const portal = await harness.app.request(`${ISSUER}/api/portal`, {
      headers: { Cookie: cookie },
    });
    const body = await readJson(portal);
    const tenants = body.tenants as Array<{
      name: string;
      services: Array<{ loginUrl: string }>;
    }>;
    const loginUrls = tenants.flatMap((t) => t.services.map((s) => s.loginUrl));

    // Assert
    expect(login.status).toBe(303);
    expect(login.headers.get("Location")).toBe("/");
    expect(portal.status).toBe(200);
    expect(body.email).toBe("alice@example.com");
    expect(tenants.map((t) => t.name)).toEqual(["Tanaka Inc.", "Suzuki Ltd."]);
    expect(loginUrls).toEqual([
      "http://tanaka.crm.localhost:3001/auth/login",
      "http://tanaka.cms.localhost:3003/auth/login",
      "http://suzuki.crm.localhost:3001/auth/login",
    ]);
  });

  test("tells a user without service assignments that nothing is available", async () => {
    const harness = await createHarness();
    const flow = await runLoginFlow(harness, { username: "carol", password: "carol-password" });

    const portal = await harness.app.request(`${ISSUER}/api/portal`, {
      headers: { Cookie: flow.cookie },
    });

    expect((await readJson(portal)).tenants).toEqual([]);
  });

  test("sends a logged-in user from /login straight to the portal", async () => {
    const harness = await createHarness();
    const flow = await runLoginFlow(harness, ALICE);

    const { response, body } = await readLoginContext(harness, "", flow.cookie);

    expect(response.status).toBe(200);
    expect(body.redirectTo).toBe("/");
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

describe("concurrency and abuse hardening", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  test("only one of two simultaneous refreshes with the same token succeeds and the family survives", async () => {
    // Arrange
    const flow = await runLoginFlow(harness, ALICE);
    const initial = await readTokenBody(
      await exchangeCode(harness, {
        code: flow.redirect.searchParams.get("code") ?? "",
        codeVerifier: flow.codeVerifier,
      }),
    );

    // Act: 同じ Refresh Token を同時に 2 回提示する
    const [first, second] = await Promise.all([
      refresh(harness, initial.refresh_token),
      refresh(harness, initial.refresh_token),
    ]);
    const winner = first.status === 200 ? first : second;
    const nextBody = await readTokenBody(winner);
    const followUp = await refresh(harness, nextBody.refresh_token);

    // Assert: 成功は 1 つだけ。二重提示は再利用ではなく消費済み扱いなので系列は生きている
    expect([first.status, second.status].filter((status) => status === 200)).toHaveLength(1);
    expect(followUp.status).toBe(200);
  });

  test("a refresh token presented by another client revokes the whole family", async () => {
    const flow = await runLoginFlow(harness, ALICE);
    const initial = await readTokenBody(
      await exchangeCode(harness, {
        code: flow.redirect.searchParams.get("code") ?? "",
        codeVerifier: flow.codeVerifier,
      }),
    );

    const byOtherClient = await refresh(harness, initial.refresh_token, "cms");
    const byOwner = await refresh(harness, initial.refresh_token);

    expect(byOtherClient.status).toBe(400);
    expect(byOwner.status).toBe(400);
  });

  test("re-login destroys the previous SSO session instead of leaving it valid", async () => {
    const first = await runLoginFlow(harness, ALICE);
    await runLoginFlow(harness, ALICE, { state: "s2", nonce: "n2" }, first.cookie);

    const sessions = harness.deps.stores.ssoSessions;
    if (!(sessions instanceof MemoryKeyValueStore)) throw new Error("unexpected store");
    expect(sessions.size()).toBe(1);
  });

  test("rate limits repeated requests to the login page from one client", async () => {
    let last = 0;
    for (let i = 0; i < 61; i += 1) {
      last = (await harness.app.request(`${ISSUER}/api/login`)).status;
    }
    expect(last).toBe(429);
  });

  test("returns invalid_client for malformed percent-encoding in Basic credentials", async () => {
    const res = await harness.app.request(`${ISSUER}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from("crm%zz:secret").toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "x" }).toString(),
    });
    expect(res.status).toBe(401);
  });
});

describe("service admin api and invitation", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  const adminCall = (
    method: "GET" | "POST" | "DELETE",
    body?: Record<string, unknown>,
    clientId = "crm",
    query = "",
  ) =>
    harness.app.request(`${ISSUER}/admin/service-members${query}`, {
      method,
      headers: {
        Authorization: basicAuth(clientId),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

  test("requires client authentication", async () => {
    const res = await harness.app.request(`${ISSUER}/admin/service-members?tenant_id=${TANAKA_ID}`);
    expect(res.status).toBe(401);
  });

  test("invites a user by email into the client's own service and links the account on first login", async () => {
    // Arrange: dave は Cognito にはいるが identity にはいない
    const invited = await adminCall("POST", {
      tenant_id: TANAKA_ID,
      email: "dave@example.com",
      name: "Dave",
    });
    const invitedBody = await readJson(invited);
    const user = invitedBody.user as { id: string; linked: boolean };

    // Act: dave が tanaka.crm にログインする
    const flow = await runLoginFlow(harness, { username: "dave", password: "dave-password" });
    const listed = await readJson(
      await adminCall("GET", undefined, "crm", `?tenant_id=${TANAKA_ID}`),
    );
    const members = listed.members as Array<{ id: string; linked: boolean }>;

    // Assert
    expect(invited.status).toBe(201);
    expect(user.linked).toBe(false);
    expect(flow.redirect.searchParams.get("code")).not.toBeNull();
    expect(members.find((m) => m.id === user.id)?.linked).toBe(true);
    expect((await harness.identity.findUserByCognitoSub("cognito-dave"))?.id).toBe(user.id);
  });

  test("refuses to invite into a tenant that has not contracted the service", async () => {
    const res = await adminCall("POST", { tenant_id: SUZUKI_ID, email: "dave@example.com" }, "cms");
    expect(res.status).toBe(403);
  });

  test("revoking removes access on the next authorization", async () => {
    await runLoginFlow(harness, ALICE);
    const revoked = await adminCall("DELETE", { tenant_id: TANAKA_ID, user_id: ALICE_ID });

    const flow = await runLoginFlow(harness, ALICE);

    expect(revoked.status).toBe(204);
    expect(flow.redirect.searchParams.get("error")).toBe("access_denied");
    expect(flow.redirect.searchParams.get("error_description")).toBe("no_membership");
  });

  test("revoking cuts the running session for that service immediately and notifies the client", async () => {
    // Arrange: alice が tanaka.crm と tanaka.cms に入っている。Back-Channel の送信先を記録する
    const received: string[] = [];
    const withFetch = await createHarness({
      fetch: async (url) => {
        received.push(String(url));
        return new Response(null, { status: 200 });
      },
    });
    const crm = await runLoginFlow(withFetch, ALICE);
    const crmTokens = await readTokenBody(
      await exchangeCode(withFetch, {
        code: crm.redirect.searchParams.get("code") ?? "",
        codeVerifier: crm.codeVerifier,
      }),
    );
    const cms = await runLoginFlow(
      withFetch,
      ALICE,
      { clientId: "cms", redirectUri: TANAKA_CMS_REDIRECT, state: "s2", nonce: "n2" },
      crm.cookie,
    );
    const cmsTokens = await readTokenBody(
      await exchangeCode(withFetch, {
        code: cms.redirect.searchParams.get("code") ?? "",
        codeVerifier: cms.codeVerifier,
        clientId: "cms",
        redirectUri: TANAKA_CMS_REDIRECT,
      }),
    );

    // Act: crm への割り当てを解除する
    const revoked = await withFetch.app.request(`${ISSUER}/admin/service-members`, {
      method: "DELETE",
      headers: { Authorization: basicAuth("crm"), "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: TANAKA_ID, user_id: ALICE_ID }),
    });
    const crmRefresh = await refresh(withFetch, crmTokens.refresh_token);
    const cmsRefresh = await refresh(withFetch, cmsTokens.refresh_token, "cms");
    const portal = await withFetch.app.request(`${ISSUER}/api/portal`, {
      headers: { Cookie: crm.cookie },
    });

    // Assert: crm の Refresh だけが失効し、cms と SSO Session は残る。crm には Back-Channel が届く
    expect(revoked.status).toBe(204);
    expect(crmRefresh.status).toBe(400);
    expect(cmsRefresh.status).toBe(200);
    expect(portal.status).toBe(200);
    expect(received).toEqual(["http://crm.localhost:3001/auth/backchannel-logout"]);
    expect(withFetch.audit.ofKind("service_member_revoked")).toHaveLength(1);
  });
});

describe("sessions and audit", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  test("records the session with the browser environment and audits login and environment changes", async () => {
    const first = await runLoginFlow(harness, ALICE);
    const { url } = authorizeUrl({ state: "s2", nonce: "n2" });
    const res = await harness.app.request(url, {
      headers: { Cookie: first.cookie, "User-Agent": "another-browser" },
    });

    const [record] = harness.sessions.all();
    expect(res.headers.get("Location")).toContain("code=");
    expect(record?.status).toBe("active");
    expect(record?.userAgent).toBe("another-browser");
    expect(harness.audit.ofKind("login_succeeded")).toHaveLength(1);
    expect(harness.audit.ofKind("environment_changed")).toHaveLength(1);
    expect(harness.audit.ofKind("environment_changed")[0]?.detail).toMatchObject({
      previous: { userAgent: "" },
      current: { userAgent: "another-browser" },
    });
  });

  test("audits failed logins without the username", async () => {
    const { url } = authorizeUrl();
    const authorizeRes = await harness.app.request(url);
    const rid =
      new URL(`${ISSUER}${authorizeRes.headers.get("Location")}`).searchParams.get("rid") ?? "";
    const { csrf, cookie } = await readLoginContext(harness, rid);

    await harness.app.request(`${ISSUER}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: new URLSearchParams({ rid, csrf, username: "alice", password: "wrong" }).toString(),
    });

    const [event] = harness.audit.ofKind("login_failed");
    expect(event?.detail).toEqual({ reason: "invalid_credentials" });
    expect(JSON.stringify(event)).not.toContain("alice");
  });

  test("lists the user's sessions and lets them revoke another device", async () => {
    // Arrange: 2 つの端末からログインしている
    const first = await runLoginFlow(harness, ALICE);
    const second = await runLoginFlow(harness, ALICE);

    // Act
    const listed = await harness.app.request(`${ISSUER}/api/sessions`, {
      headers: { Cookie: first.cookie },
    });
    const listedBody = await readJson(listed);
    const sessions = listedBody.sessions as Array<{
      id: string;
      current: boolean;
      services: Array<{ client_id: string; tenant_slug: string }>;
    }>;
    const other = sessions.find((s) => !s.current);
    const revoked = await harness.app.request(`${ISSUER}/sessions/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeaderFrom(listed, first.cookie),
      },
      body: new URLSearchParams({
        csrf: String(listedBody.csrfToken),
        session_id: other?.id ?? "",
      }).toString(),
    });
    const afterRevoke = await readJson(
      await harness.app.request(`${ISSUER}/api/sessions`, { headers: { Cookie: first.cookie } }),
    );
    const secondAuthorize = await harness.app.request(authorizeUrl({ state: "s3" }).url, {
      headers: { Cookie: second.cookie },
    });

    // Assert
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.current)?.services).toEqual([
      { client_id: "crm", name: "CRM", tenant_slug: "tanaka", tenant_name: "Tanaka Inc." },
    ]);
    expect(revoked.status).toBe(303);
    expect(revoked.headers.get("Location")).toBe("/security");
    expect((afterRevoke.sessions as unknown[]).length).toBe(1);
    expect(secondAuthorize.headers.get("Location")).toMatch(/^\/login\?rid=/);
    expect(harness.audit.ofKind("session_revoked")).toHaveLength(1);
  });

  test("does not let a user revoke someone else's session", async () => {
    const alice = await runLoginFlow(harness, ALICE);
    const bob = await runLoginFlow(
      harness,
      { username: "bob", password: "bob-password" },
      {
        redirectUri: SUZUKI_CRM_REDIRECT,
      },
    );
    const bobSid = harness.sessions.all().find((s) => s.userId === "user-bob")?.id ?? "";
    const listed = await harness.app.request(`${ISSUER}/api/sessions`, {
      headers: { Cookie: alice.cookie },
    });
    const listedBody = await readJson(listed);

    await harness.app.request(`${ISSUER}/sessions/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeaderFrom(listed, alice.cookie),
      },
      body: new URLSearchParams({
        csrf: String(listedBody.csrfToken),
        session_id: bobSid,
      }).toString(),
    });
    const bobStillIn = await harness.app.request(
      authorizeUrl({ state: "s3", redirectUri: SUZUKI_CRM_REDIRECT }).url,
      { headers: { Cookie: bob.cookie } },
    );

    expect(bobStillIn.headers.get("Location")).toContain("code=");
    expect(harness.sessions.all().find((s) => s.id === bobSid)?.status).toBe("active");
  });
});

describe("multi-factor authentication", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  const passwordLogin = async (username: string, password: string) => {
    const { url } = authorizeUrl();
    const authorizeRes = await harness.app.request(url);
    const rid =
      new URL(`${ISSUER}${authorizeRes.headers.get("Location")}`).searchParams.get("rid") ?? "";
    const { csrf, cookie } = await readLoginContext(harness, rid);
    const res = await harness.app.request(`${ISSUER}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: new URLSearchParams({ rid, csrf, username, password }).toString(),
    });
    const location = new URL(res.headers.get("Location") ?? "", ISSUER);
    return {
      res,
      cookie: cookieHeaderFrom(res, cookie),
      mid: location.searchParams.get("mid") ?? "",
      path: location.pathname,
    };
  };

  const postCode = async (path: string, cookie: string, mid: string, code: string) => {
    const api = path === "/login/challenge" ? "/api/login/challenge" : "/api/login/mfa-setup";
    const context = await harness.app.request(`${ISSUER}${api}?mid=${mid}`, {
      headers: { Cookie: cookie },
    });
    const body = await readJson(context);
    const res = await harness.app.request(`${ISSUER}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeaderFrom(context, cookie),
      },
      body: new URLSearchParams({ mid, csrf: String(body.csrfToken), code }).toString(),
    });
    return { res, body, cookie: cookieHeaderFrom(res, cookieHeaderFrom(context, cookie)) };
  };

  test("an enrolled user must enter the authenticator code and a wrong code is refused and audited", async () => {
    const first = await passwordLogin("alice", "alice-password");
    const wrong = await postCode(first.path, first.cookie, first.mid, "000000");
    const right = await postCode(
      first.path,
      first.cookie,
      first.mid,
      generateTotp(MOCK_TOTP_SECRETS.alice ?? "", harness.clock.nowSeconds()),
    );

    expect(first.path).toBe("/login/challenge");
    expect(wrong.res.headers.get("Location")).toBe(
      `/login/challenge?mid=${encodeURIComponent(first.mid)}&error=code_mismatch`,
    );
    expect(harness.audit.ofKind("mfa_challenge_failed")).toHaveLength(1);
    expect(right.res.headers.get("Location")).toContain("code=");
    expect(right.res.headers.getSetCookie().some((c) => c.startsWith("sso_session="))).toBe(true);
    expect(harness.audit.ofKind("login_succeeded")[0]?.detail).toEqual({ mfa: "totp" });
  });

  test("a user without an authenticator enrolls with a QR secret before the first session and is challenged next time", async () => {
    // dave は招待済みだが認証アプリを登録していない
    await harness.app.request(`${ISSUER}/admin/service-members`, {
      method: "POST",
      headers: { Authorization: basicAuth("crm"), "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: TANAKA_ID, email: "dave@example.com", name: "Dave" }),
    });
    const first = await passwordLogin("dave", "dave-password");
    const setup = await harness.app.request(`${ISSUER}/api/login/mfa-setup?mid=${first.mid}`, {
      headers: { Cookie: first.cookie },
    });
    const setupBody = await readJson(setup);
    const secret = String(setupBody.secret);
    const enrolled = await postCode(
      first.path,
      cookieHeaderFrom(setup, first.cookie),
      first.mid,
      generateTotp(secret, harness.clock.nowSeconds()),
    );
    const security = await readJson(
      await harness.app.request(`${ISSUER}/api/sessions`, { headers: { Cookie: enrolled.cookie } }),
    );
    const second = await passwordLogin("dave", "dave-password");

    expect(first.path).toBe("/login/mfa-setup");
    expect(setupBody.otpauthUri).toContain("otpauth://totp/Sandbox%3Adave%40example.com?secret=");
    expect(Number(setupBody.expiresAt)).toBe(harness.clock.nowSeconds() + 3 * 60);
    expect(enrolled.res.headers.get("Location")).toContain("code=");
    expect(harness.audit.ofKind("mfa_enrolled")).toHaveLength(1);
    expect(security.mfa_methods).toEqual([
      { method: "totp", enrolled_at: harness.clock.nowSeconds() },
    ]);
    expect(second.path).toBe("/login/challenge");
  });

  test("an expired QR code is replaced by a new secret and the old code stops working", async () => {
    // 未登録の dave で試す。招待していないので JIT 作成になる
    const dave = await passwordLogin("dave", "dave-password");
    const setupRes = await harness.app.request(`${ISSUER}/api/login/mfa-setup?mid=${dave.mid}`, {
      headers: { Cookie: dave.cookie },
    });
    const setup = await readJson(setupRes);
    const cookie = cookieHeaderFrom(setupRes, dave.cookie);
    harness.clock.advance(3 * 60 + 1);

    // 画面を取り直さずに古い QR のコードを送ると期限切れになる
    const expired = await harness.app.request(`${ISSUER}/login/mfa-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: new URLSearchParams({
        mid: dave.mid,
        csrf: String(setup.csrfToken),
        code: generateTotp(String(setup.secret), harness.clock.nowSeconds()),
      }).toString(),
    });
    // 取り直すと新しい secret になり、その secret のコードで登録できる
    const renewed = await readJson(
      await harness.app.request(`${ISSUER}/api/login/mfa-setup?mid=${dave.mid}&renew=1`, {
        headers: { Cookie: cookie },
      }),
    );
    const done = await postCode(
      dave.path,
      cookie,
      dave.mid,
      generateTotp(String(renewed.secret), harness.clock.nowSeconds()),
    );

    expect(dave.path).toBe("/login/mfa-setup");
    expect(expired.headers.get("Location")).toBe(
      `/login/mfa-setup?mid=${encodeURIComponent(dave.mid)}&error=setup_expired`,
    );
    expect(renewed.secret).not.toBe(setup.secret);
    expect(Number(renewed.expiresAt)).toBe(harness.clock.nowSeconds() + 3 * 60);
    // dave は招待していないので code は出ないが、登録とログイン自体は完了して callback に戻る
    expect(done.res.headers.get("Location")).toContain(TANAKA_CRM_REDIRECT);
    expect(done.res.headers.getSetCookie().some((c) => c.startsWith("sso_session="))).toBe(true);
    expect(harness.audit.ofKind("mfa_setup_expired")).toHaveLength(1);
  });

  test("a pending challenge expires and sends the user back to the login screen", async () => {
    const first = await passwordLogin("alice", "alice-password");
    harness.clock.advance(5 * 60 + 1);
    const late = await postCode(
      first.path,
      first.cookie,
      first.mid,
      generateTotp(MOCK_TOTP_SECRETS.alice ?? "", harness.clock.nowSeconds()),
    );
    expect(late.res.headers.get("Location")).toBe("/login?error=challenge_expired");
  });
});
