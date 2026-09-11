/**
 * ローカルの db/init/004_seed.sql と同じ関係のテストデータ。
 *   サービス : crm, cms
 *   テナント : tanaka (crm と cms を契約), suzuki (crm のみ契約)
 *   alice: tanaka の crm / cms、suzuki の crm に入れる
 *   bob  : suzuki の crm に入れる
 *   carol: 割り当てなし
 *   tenant_members は会社横断の役割。alice は tanaka の owner、bob は suzuki の owner
 * サービス側の役割と権限、業務データは各サービスの DB (db/crm, db/cms) にあり、この tool では扱わない
 */
export interface SeedUser {
  /** users.id。ローカルの 004_seed.sql と同じ固定 ID */
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly name: string;
  /** Cognito を使わない場合の固定 sub */
  readonly fallbackSub: string;
}

export interface SeedTenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface SeedMembership {
  readonly tenantSlug: string;
  readonly username: string;
  readonly role: "owner" | "admin" | "member";
}

export interface SeedService {
  /** oidc_clients.id。ローカルの 004_seed.sql と同じ固定 ID */
  readonly id: string;
  readonly clientId: string;
}

export interface SeedContract {
  readonly tenantSlug: string;
  readonly clientId: string;
}

/** サービスに入れる人。役割はサービス側の DB が持つ */
export interface SeedServiceMembership {
  readonly tenantSlug: string;
  readonly clientId: string;
  readonly username: string;
}

export const SEED_USERS: ReadonlyArray<SeedUser> = [
  {
    id: "01J0000000000000000000ALICE",
    username: "alice",
    email: "alice@example.com",
    name: "Alice",
    fallbackSub: "cognito-sub-alice",
  },
  {
    id: "01J00000000000000000000BOB0",
    username: "bob",
    email: "bob@example.com",
    name: "Bob",
    fallbackSub: "cognito-sub-bob",
  },
  {
    id: "01J0000000000000000000CAROL",
    username: "carol",
    email: "carol@example.com",
    name: "Carol",
    fallbackSub: "cognito-sub-carol",
  },
];

export const SEED_TENANTS: ReadonlyArray<SeedTenant> = [
  { id: "01J00000000000000000TANAKA0", slug: "tanaka", name: "Tanaka Inc." },
  { id: "01J00000000000000000SUZUKI0", slug: "suzuki", name: "Suzuki Ltd." },
];

export const SEED_SERVICES: ReadonlyArray<SeedService> = [
  { id: "01J00000000000000000000CRM", clientId: "crm" },
  { id: "01J00000000000000000000CMS", clientId: "cms" },
];

export const SEED_CONTRACTS: ReadonlyArray<SeedContract> = [
  { tenantSlug: "tanaka", clientId: "crm" },
  { tenantSlug: "tanaka", clientId: "cms" },
  { tenantSlug: "suzuki", clientId: "crm" },
];

export const SEED_MEMBERSHIPS: ReadonlyArray<SeedMembership> = [
  { tenantSlug: "tanaka", username: "alice", role: "owner" },
  { tenantSlug: "suzuki", username: "bob", role: "owner" },
];

export const SEED_SERVICE_MEMBERSHIPS: ReadonlyArray<SeedServiceMembership> = [
  { tenantSlug: "tanaka", clientId: "crm", username: "alice" },
  { tenantSlug: "tanaka", clientId: "cms", username: "alice" },
  { tenantSlug: "suzuki", clientId: "crm", username: "alice" },
  { tenantSlug: "suzuki", clientId: "crm", username: "bob" },
];
