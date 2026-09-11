import { beforeEach, describe, expect, test } from "vitest";
import {
  ALICE_ID,
  BOB_ID,
  bearer,
  issueTestAccessToken,
  jsonBody,
  readJson,
  SUZUKI_ID,
  TANAKA_ID,
} from "@sandbox/api-core/test-support";
import { createCrmHarness, CRM_AUDIENCE, type CrmHarness } from "./test-support.ts";

describe("crm end users", () => {
  let crm: CrmHarness;

  beforeEach(async () => {
    crm = await createCrmHarness();
  });

  test("owner reads end users unmasked", async () => {
    const token = await issueTestAccessToken(crm, { userId: ALICE_ID, tenantId: TANAKA_ID });

    const res = await crm.app.request(`${CRM_AUDIENCE}/v1/end-users`, bearer(token));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.masked).toBe(false);
    expect(body.end_users).toEqual([
      expect.objectContaining({ email: "taro.yamada@example.com", phone: "090-1111-2222" }),
    ]);
  });

  test("a member without unmask sees masked email and phone but can still read", async () => {
    // bob は suzuki の admin なので既定で解除できる。テストでは deny で外す
    crm.members.replaceOverrides(SUZUKI_ID, BOB_ID, [
      { permission: "end_users:unmask", effect: "deny" },
    ]);
    const token = await issueTestAccessToken(crm, { userId: BOB_ID, tenantId: SUZUKI_ID });

    const body = await readJson(
      await crm.app.request(`${CRM_AUDIENCE}/v1/end-users`, bearer(token)),
    );

    expect(body.masked).toBe(true);
    expect(body.end_users).toEqual([
      expect.objectContaining({ email: "j***@example.com", phone: "***-****-8888", masked: true }),
    ]);
  });

  test("a viewer with an allow override reads unmasked", async () => {
    const token = await issueTestAccessToken(crm, { userId: ALICE_ID, tenantId: SUZUKI_ID });

    const body = await readJson(
      await crm.app.request(`${CRM_AUDIENCE}/v1/end-users`, bearer(token)),
    );

    expect(body.masked).toBe(false);
  });

  test("viewer cannot create but member-level roles can update, only owner and admin can delete", async () => {
    const viewer = await issueTestAccessToken(crm, { userId: ALICE_ID, tenantId: SUZUKI_ID });
    const admin = await issueTestAccessToken(crm, { userId: BOB_ID, tenantId: SUZUKI_ID });
    const input = { name: "新規", email: "new@example.com", phone: "090-0000-0000" };

    const denied = await crm.app.request(
      `${CRM_AUDIENCE}/v1/end-users`,
      bearer(viewer, jsonBody(input)),
    );
    const created = await crm.app.request(
      `${CRM_AUDIENCE}/v1/end-users`,
      bearer(admin, jsonBody(input)),
    );
    const createdBody = await readJson(created);
    const id = String((createdBody.end_user as { id: string }).id);
    const updated = await crm.app.request(
      `${CRM_AUDIENCE}/v1/end-users/${id}`,
      bearer(admin, jsonBody({ note: "更新" }, "PATCH")),
    );
    const deletedByViewer = await crm.app.request(
      `${CRM_AUDIENCE}/v1/end-users/${id}`,
      bearer(viewer, { method: "DELETE" }),
    );
    const deleted = await crm.app.request(
      `${CRM_AUDIENCE}/v1/end-users/${id}`,
      bearer(admin, { method: "DELETE" }),
    );

    expect(denied.status).toBe(403);
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(deletedByViewer.status).toBe(403);
    expect(deleted.status).toBe(204);
  });

  test("end users of another tenant are not visible even with a valid token", async () => {
    const token = await issueTestAccessToken(crm, { userId: ALICE_ID, tenantId: TANAKA_ID });

    const res = await crm.app.request(`${CRM_AUDIENCE}/v1/end-users/eu-s1`, bearer(token));

    expect(res.status).toBe(404);
  });

  test("a user admitted by auth without a member row is created as viewer", async () => {
    // identity で入れる判定は済んでいる前提。crm 側に行が無ければ最下位の役割で作る
    const token = await issueTestAccessToken(crm, { userId: "user-new", tenantId: TANAKA_ID });

    const me = await readJson(await crm.app.request(`${CRM_AUDIENCE}/v1/me`, bearer(token)));

    expect(me.role).toBe("viewer");
    expect(await crm.members.find(TANAKA_ID, "user-new")).toMatchObject({ role: "viewer" });
  });
});

describe("crm member management", () => {
  let crm: CrmHarness;

  beforeEach(async () => {
    crm = await createCrmHarness();
  });

  test("owner invites a member through auth and stores the role locally", async () => {
    const token = await issueTestAccessToken(crm, { userId: ALICE_ID, tenantId: TANAKA_ID });

    const res = await crm.app.request(
      `${CRM_AUDIENCE}/v1/members`,
      bearer(token, jsonBody({ email: "dave@example.com", name: "Dave", role: "member" })),
    );
    const body = await readJson(res);

    expect(res.status).toBe(201);
    expect(crm.authAdmin.invited).toEqual([{ tenantId: TANAKA_ID, email: "dave@example.com" }]);
    expect(body.member).toMatchObject({ email: "dave@example.com", role: "member" });
    expect(body.linked).toBe(false);
  });

  test("owner changes a role and sets permission overrides, viewer cannot", async () => {
    const owner = await issueTestAccessToken(crm, { userId: ALICE_ID, tenantId: TANAKA_ID });
    await crm.members.upsert({
      tenantId: TANAKA_ID,
      userId: BOB_ID,
      email: null,
      name: null,
      role: "viewer",
      status: "active",
    });

    const patched = await crm.app.request(
      `${CRM_AUDIENCE}/v1/members/${BOB_ID}`,
      bearer(owner, jsonBody({ role: "member" }, "PATCH")),
    );
    const perms = await crm.app.request(
      `${CRM_AUDIENCE}/v1/members/${BOB_ID}/permissions`,
      bearer(
        owner,
        jsonBody({ overrides: [{ permission: "end_users:unmask", effect: "allow" }] }, "PUT"),
      ),
    );
    const permsBody = await readJson(perms);
    const bobToken = await issueTestAccessToken(crm, { userId: BOB_ID, tenantId: TANAKA_ID });
    const bobMe = await readJson(await crm.app.request(`${CRM_AUDIENCE}/v1/me`, bearer(bobToken)));
    const forbidden = await crm.app.request(
      `${CRM_AUDIENCE}/v1/members/${ALICE_ID}`,
      bearer(bobToken, jsonBody({ role: "owner" }, "PATCH")),
    );

    expect(patched.status).toBe(200);
    expect(perms.status).toBe(200);
    expect(permsBody.permissions).toContain("end_users:unmask");
    expect(bobMe.role).toBe("member");
    expect(bobMe.permissions).toContain("end_users:unmask");
    expect(forbidden.status).toBe(403);
  });

  test("removing a member revokes access in auth and rejects unknown permissions", async () => {
    const owner = await issueTestAccessToken(crm, { userId: ALICE_ID, tenantId: TANAKA_ID });
    await crm.members.upsert({
      tenantId: TANAKA_ID,
      userId: BOB_ID,
      email: null,
      name: null,
      role: "viewer",
      status: "active",
    });

    const badPerm = await crm.app.request(
      `${CRM_AUDIENCE}/v1/members/${BOB_ID}/permissions`,
      bearer(
        owner,
        jsonBody({ overrides: [{ permission: "posts:create", effect: "allow" }] }, "PUT"),
      ),
    );
    const removed = await crm.app.request(
      `${CRM_AUDIENCE}/v1/members/${BOB_ID}`,
      bearer(owner, { method: "DELETE" }),
    );
    const self = await crm.app.request(
      `${CRM_AUDIENCE}/v1/members/${ALICE_ID}`,
      bearer(owner, { method: "DELETE" }),
    );

    expect(badPerm.status).toBe(400);
    expect(removed.status).toBe(204);
    expect(crm.authAdmin.revoked).toEqual([{ tenantId: TANAKA_ID, userId: BOB_ID }]);
    expect(await crm.members.find(TANAKA_ID, BOB_ID)).toBeUndefined();
    expect(self.status).toBe(400);
  });

  test("a crm token is rejected on a wrong host and an unknown role is rejected", async () => {
    const owner = await issueTestAccessToken(crm, { userId: ALICE_ID, tenantId: TANAKA_ID });

    const wrongHost = await crm.app.request("http://api.cms.localhost:3004/v1/me", bearer(owner));
    const badRole = await crm.app.request(
      `${CRM_AUDIENCE}/v1/members`,
      bearer(owner, jsonBody({ email: "x@example.com", role: "editor" })),
    );

    expect(wrongHost.status).toBe(404);
    expect(badRole.status).toBe(400);
  });
});
