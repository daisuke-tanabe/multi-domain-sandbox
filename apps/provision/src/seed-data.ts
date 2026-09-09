/**
 * ローカルの db/init/004_seed.sql と同じ関係のテストデータ。
 *   alice: tenant-a owner / tenant-b viewer
 *   bob  : tenant-b admin
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
  { id: "01J000000000000000000TENANTA", slug: "tenant-a", name: "Tenant A" },
  { id: "01J000000000000000000TENANTB", slug: "tenant-b", name: "Tenant B" },
];

export const SEED_MEMBERSHIPS: ReadonlyArray<SeedMembership> = [
  { tenantSlug: "tenant-a", username: "alice", role: "owner" },
  { tenantSlug: "tenant-b", username: "alice", role: "viewer" },
  { tenantSlug: "tenant-b", username: "bob", role: "admin" },
];

export const SEED_PROJECTS: ReadonlyArray<SeedProject> = [
  {
    id: "01J0000000000000000PROJECTA1",
    tenantSlug: "tenant-a",
    name: "Tenant A Project 1",
    createdBy: "alice",
  },
  {
    id: "01J0000000000000000PROJECTA2",
    tenantSlug: "tenant-a",
    name: "Tenant A Project 2",
    createdBy: "alice",
  },
  {
    id: "01J0000000000000000PROJECTB1",
    tenantSlug: "tenant-b",
    name: "Tenant B Project 1",
    createdBy: "bob",
  },
];
