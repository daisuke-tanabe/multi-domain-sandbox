/**
 * ローカルの db/init/004_seed.sql と同じ関係のテストデータ。
 *   サービス : crm, cms
 *   テナント : tanaka (crm と cms を契約), suzuki (crm のみ契約)
 *   alice: tanaka owner / suzuki viewer
 *   bob  : suzuki admin
 *   carol: 所属なし
 */
export interface SeedUser {
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
  readonly role: "owner" | "admin" | "member" | "viewer";
}

export interface SeedContract {
  readonly tenantSlug: string;
  readonly clientId: string;
}

export interface SeedProject {
  readonly id: string;
  readonly tenantSlug: string;
  readonly name: string;
  readonly createdBy: string;
}

export const SEED_USERS: ReadonlyArray<SeedUser> = [
  {
    username: "alice",
    email: "alice@example.com",
    name: "Alice",
    fallbackSub: "cognito-sub-alice",
  },
  { username: "bob", email: "bob@example.com", name: "Bob", fallbackSub: "cognito-sub-bob" },
  {
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

export const SEED_CONTRACTS: ReadonlyArray<SeedContract> = [
  { tenantSlug: "tanaka", clientId: "crm" },
  { tenantSlug: "tanaka", clientId: "cms" },
  { tenantSlug: "suzuki", clientId: "crm" },
];

export const SEED_MEMBERSHIPS: ReadonlyArray<SeedMembership> = [
  { tenantSlug: "tanaka", username: "alice", role: "owner" },
  { tenantSlug: "suzuki", username: "alice", role: "viewer" },
  { tenantSlug: "suzuki", username: "bob", role: "admin" },
];

export const SEED_PROJECTS: ReadonlyArray<SeedProject> = [
  {
    id: "01J0000000000000000PROJECTT1",
    tenantSlug: "tanaka",
    name: "Tanaka Project 1",
    createdBy: "alice",
  },
  {
    id: "01J0000000000000000PROJECTT2",
    tenantSlug: "tanaka",
    name: "Tanaka Project 2",
    createdBy: "alice",
  },
  {
    id: "01J0000000000000000PROJECTS1",
    tenantSlug: "suzuki",
    name: "Suzuki Project 1",
    createdBy: "bob",
  },
];
