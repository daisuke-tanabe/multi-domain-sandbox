import {
  ALICE_ID,
  createApiHarness,
  TANAKA_ID,
  type ApiHarness,
  type ApiHarnessOptions,
} from "@sandbox/api-core/test-support";
import { CMS } from "./definition.ts";
import { MemoryPostRepository } from "./posts/repository.ts";
import { postRoutes } from "./posts/routes.ts";

export const CMS_AUDIENCE = "http://api.cms.localhost:3004";

export interface CmsHarness extends ApiHarness {
  readonly posts: MemoryPostRepository;
}

/**
 * db/cms/init/002_seed.sql と同じ関係のデータ。
 *   alice : tanaka では owner だが posts:create を deny
 */
export async function createCmsHarness(
  options: Pick<ApiHarnessOptions, "signingKey" | "clock"> = {},
): Promise<CmsHarness> {
  const posts = new MemoryPostRepository([
    {
      id: "post-1",
      tenantId: TANAKA_ID,
      title: "はじめての投稿",
      body: "CMS の動作確認用の本文です。",
      authorId: ALICE_ID,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ]);
  const harness = await createApiHarness({
    ...options,
    definition: CMS,
    audience: CMS_AUDIENCE,
    clientId: "cms",
    members: [
      {
        tenantId: TANAKA_ID,
        userId: ALICE_ID,
        email: "alice@example.com",
        name: "Alice",
        role: "owner",
        status: "active",
      },
    ],
    overrides: [
      { tenantId: TANAKA_ID, userId: ALICE_ID, permission: "posts:create", effect: "deny" },
    ],
    routes: () => [postRoutes(posts)],
  });
  return { ...harness, posts };
}
