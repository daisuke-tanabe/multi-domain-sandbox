import { generateSigningKey, signJwt } from "@sandbox/shared";
import { beforeEach, describe, expect, test } from "vitest";
import {
  ALICE_ID,
  API_AUDIENCE,
  BOB_ID,
  CMS_AUDIENCE,
  createApiHarness,
  issueTestAccessToken,
  TANAKA_ID,
  SUZUKI_ID,
  type ApiHarness,
} from "./test-support.ts";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) throw new Error("expected JSON object");
  return { ...body };
}

describe("authentication", () => {
  let harness: ApiHarness;

  beforeEach(async () => {
    harness = await createApiHarness();
  });

  test("returns 401 without Authorization header", async () => {
    const res = await harness.app.request(`${API_AUDIENCE}/v1/me`);
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Bearer/);
  });

  test("rejects a token with wrong audience such as an ID token", async () => {
    const token = await issueTestAccessToken(harness, {
      userId: ALICE_ID,
      tenantId: TANAKA_ID,
      audience: "crm",
    });
    const res = await harness.app.request(`${API_AUDIENCE}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  test("rejects a crm access token presented to the cms api host", async () => {
    // aud は届いたホストから決まる。サービスをまたいだ Token の持ち回りはできない
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: TANAKA_ID });
    const res = await harness.app.request(`${CMS_AUDIENCE}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  test("accepts a cms access token on the cms api host", async () => {
    const token = await issueTestAccessToken(harness, {
      userId: ALICE_ID,
      tenantId: TANAKA_ID,
      audience: CMS_AUDIENCE,
    });
    const res = await harness.app.request(`${CMS_AUDIENCE}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  test("returns 404 for an unknown api host", async () => {
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: TANAKA_ID });
    const res = await harness.app.request("http://api.other.localhost:3002/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  test("rejects a token signed by an unknown key", async () => {
    const otherKey = await generateSigningKey();
    const now = harness.clock.nowSeconds();
    const token = await signJwt(otherKey, {
      issuer: "http://auth.localhost:3000",
      audience: API_AUDIENCE,
      subject: ALICE_ID,
      issuedAt: now,
      expiresAt: now + 900,
      claims: { tenant_id: TANAKA_ID, sid: "s", client_id: "crm", scope: "openid" },
    });
    const res = await harness.app.request(`${API_AUDIENCE}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  test("reports expired token so the BFF can refresh and retry", async () => {
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: TANAKA_ID });
    harness.clock.advance(1000);

    const res = await harness.app.request(`${API_AUDIENCE}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("expired");
  });

  test("rejects a token without tenant_id claim", async () => {
    const now = harness.clock.nowSeconds();
    const token = await signJwt(harness.signingKey, {
      issuer: "http://auth.localhost:3000",
      audience: API_AUDIENCE,
      subject: ALICE_ID,
      issuedAt: now,
      expiresAt: now + 900,
      claims: { sid: "s", client_id: "crm", scope: "openid" },
    });
    const res = await harness.app.request(`${API_AUDIENCE}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("membership based authorization", () => {
  let harness: ApiHarness;

  beforeEach(async () => {
    harness = await createApiHarness();
  });

  test("returns user, tenant and role from tenant_members for a valid token", async () => {
    // Arrange
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: SUZUKI_ID });

    // Act
    const res = await harness.app.request(`${API_AUDIENCE}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Assert
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({
      user: { id: ALICE_ID },
      tenant: { id: SUZUKI_ID, slug: "suzuki" },
      role: "viewer",
    });
  });

  test("ignores role claim inside the token and uses the database role", async () => {
    const token = await issueTestAccessToken(harness, {
      userId: ALICE_ID,
      tenantId: SUZUKI_ID,
      extraClaims: { role: "owner" },
    });

    const res = await harness.app.request(`${API_AUDIENCE}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(await readJson(res)).toMatchObject({ role: "viewer" });
  });

  test("returns 403 when the token names a tenant the user does not belong to", async () => {
    // bob は tanaka に所属しない。Token の tenant_id だけでは認可しない
    const token = await issueTestAccessToken(harness, { userId: BOB_ID, tenantId: TANAKA_ID });

    const res = await harness.app.request(`${API_AUDIENCE}/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(403);
  });

  test("returns 403 once membership is removed even if the token is still valid", async () => {
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: TANAKA_ID });
    const before = await harness.app.request(`${API_AUDIENCE}/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    harness.identity.removeMembership(TANAKA_ID, ALICE_ID);

    const after = await harness.app.request(`${API_AUDIENCE}/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(before.status).toBe(200);
    expect(after.status).toBe(403);
  });

  test("denies write permission to viewer role", async () => {
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: SUZUKI_ID });

    const res = await harness.app.request(`${API_AUDIENCE}/v1/projects`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "new" }),
    });

    expect(res.status).toBe(403);
  });
});

describe("tenant isolation", () => {
  let harness: ApiHarness;

  beforeEach(async () => {
    harness = await createApiHarness();
  });

  test("lists only projects of the token tenant", async () => {
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: TANAKA_ID });

    const res = await harness.app.request(`${API_AUDIENCE}/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(await readJson(res)).toEqual({
      projects: [{ id: "project-t1", name: "Tanaka Project 1", created_by: ALICE_ID }],
    });
  });

  test("returns 404 for a project id that belongs to another tenant", async () => {
    // alice は suzuki にも所属するが、tanaka の Token で suzuki のリソースは見えない
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: TANAKA_ID });

    const res = await harness.app.request(`${API_AUDIENCE}/v1/projects/project-s1`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  test("creates a project inside the token tenant regardless of request body hints", async () => {
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: TANAKA_ID });

    const res = await harness.app.request(`${API_AUDIENCE}/v1/projects`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Tenant-Id": SUZUKI_ID,
      },
      body: JSON.stringify({ name: "created", tenant_id: SUZUKI_ID }),
    });
    const listB = await harness.projects.list({
      tenantId: SUZUKI_ID,
      userId: ALICE_ID,
      role: "viewer",
    });
    const listA = await harness.projects.list({
      tenantId: TANAKA_ID,
      userId: ALICE_ID,
      role: "owner",
    });

    expect(res.status).toBe(201);
    expect(listB.map((p) => p.name)).not.toContain("created");
    expect(listA.map((p) => p.name)).toContain("created");
  });

  test("rejects invalid project payload", async () => {
    const token = await issueTestAccessToken(harness, { userId: ALICE_ID, tenantId: TANAKA_ID });

    const res = await harness.app.request(`${API_AUDIENCE}/v1/projects`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
  });
});
