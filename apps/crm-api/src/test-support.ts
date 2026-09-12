import {
  ALICE_ID,
  BOB_ID,
  createApiHarness,
  SUZUKI_ID,
  TANAKA_ID,
  type ApiHarness,
  type ApiHarnessOptions,
} from "@sandbox/api-core/test-support";
import { CRM } from "./definition.ts";
import { MemoryEndUserRepository } from "./end-users/infrastructure/memory-end-user-repository.ts";
import { endUserRoutes } from "./end-users/interface/routes.ts";

export const CRM_AUDIENCE = "http://api.crm.localhost:3002";

export interface CrmHarness extends ApiHarness {
  readonly endUsers: MemoryEndUserRepository;
}

/**
 * db/crm/init/002_seed.sql と同じ関係のデータ。
 *   alice : tanaka では owner、suzuki では viewer。suzuki では end_users:unmask を allow
 *   bob   : suzuki では admin
 */
export async function createCrmHarness(
  options: Pick<ApiHarnessOptions, "signingKey" | "clock"> = {},
): Promise<CrmHarness> {
  const endUsers = new MemoryEndUserRepository([
    {
      id: "eu-t1",
      tenantId: TANAKA_ID,
      name: "山田 太郎",
      email: "taro.yamada@example.com",
      phone: "090-1111-2222",
      note: "優良顧客",
    },
    {
      id: "eu-s1",
      tenantId: SUZUKI_ID,
      name: "鈴木 次郎",
      email: "jiro.suzuki@example.com",
      phone: "090-7777-8888",
      note: "",
    },
  ]);
  const harness = await createApiHarness({
    ...options,
    definition: CRM,
    audience: CRM_AUDIENCE,
    clientId: "crm",
    members: [
      {
        tenantId: TANAKA_ID,
        userId: ALICE_ID,
        email: "alice@example.com",
        name: "Alice",
        role: "owner",
        status: "active",
      },
      {
        tenantId: SUZUKI_ID,
        userId: ALICE_ID,
        email: "alice@example.com",
        name: "Alice",
        role: "viewer",
        status: "active",
      },
      {
        tenantId: SUZUKI_ID,
        userId: BOB_ID,
        email: "bob@example.com",
        name: "Bob",
        role: "admin",
        status: "active",
      },
    ],
    overrides: [
      { tenantId: SUZUKI_ID, userId: ALICE_ID, permission: "end_users:unmask", effect: "allow" },
    ],
    routes: () => [endUserRoutes({ endUsers })],
  });
  return { ...harness, endUsers };
}
