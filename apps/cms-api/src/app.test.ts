import { beforeEach, describe, expect, test } from "vitest";
import {
  ALICE_ID,
  bearer,
  issueTestAccessToken,
  jsonBody,
  readJson,
  TANAKA_ID,
} from "@sandbox/api-core/test-support";
import { createCmsHarness, CMS_AUDIENCE, type CmsHarness } from "./test-support.ts";

describe("cms posts", () => {
  let cms: CmsHarness;

  beforeEach(async () => {
    cms = await createCmsHarness();
  });

  test("owner with a create deny can read and update but not create", async () => {
    const token = await issueTestAccessToken(cms, { userId: ALICE_ID, tenantId: TANAKA_ID });

    const list = await cms.app.request(`${CMS_AUDIENCE}/v1/posts`, bearer(token));
    const created = await cms.app.request(
      `${CMS_AUDIENCE}/v1/posts`,
      bearer(token, jsonBody({ title: "t", body: "b" })),
    );
    const updated = await cms.app.request(
      `${CMS_AUDIENCE}/v1/posts/post-1`,
      bearer(token, jsonBody({ title: "更新" }, "PATCH")),
    );

    expect(list.status).toBe(200);
    expect((await readJson(list)).posts).toHaveLength(1);
    expect(created.status).toBe(403);
    expect(updated.status).toBe(200);
  });

  test("an editor invited through the owner can create and delete posts", async () => {
    const owner = await issueTestAccessToken(cms, { userId: ALICE_ID, tenantId: TANAKA_ID });
    const invited = await cms.app.request(
      `${CMS_AUDIENCE}/v1/members`,
      bearer(owner, jsonBody({ email: "bob@example.com", role: "editor" })),
    );
    const invitedBody = await readJson(invited);
    const editorId = String((invitedBody.member as { user_id: string }).user_id);
    const editor = await issueTestAccessToken(cms, { userId: editorId, tenantId: TANAKA_ID });

    const created = await cms.app.request(
      `${CMS_AUDIENCE}/v1/posts`,
      bearer(editor, jsonBody({ title: "編集者の投稿", body: "本文" })),
    );
    const id = String(((await readJson(created)).post as { id: string }).id);
    const deleted = await cms.app.request(
      `${CMS_AUDIENCE}/v1/posts/${id}`,
      bearer(editor, { method: "DELETE" }),
    );
    const invite = await cms.app.request(
      `${CMS_AUDIENCE}/v1/members`,
      bearer(editor, jsonBody({ email: "x@example.com", role: "viewer" })),
    );

    expect(invited.status).toBe(201);
    expect(created.status).toBe(201);
    expect(deleted.status).toBe(204);
    // editor は招待できない
    expect(invite.status).toBe(403);
  });
});
