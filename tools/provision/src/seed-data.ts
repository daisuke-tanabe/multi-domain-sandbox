import type { Role } from "@sandbox/shared";

/**
 * ローカルの db/init/004_seed.sql と同じ関係のテストデータ。
 *   サービス : crm, cms
 *   テナント : tanaka (crm と cms を契約), suzuki (crm のみ契約)
 *   alice: tanaka では crm / cms の owner、suzuki では crm の viewer。tanaka の cms では projects:write を拒否
 *   bob  : suzuki の crm の admin
 *   carol: 割り当てなし
 *   tenant_members は会社横断の役割。alice は tanaka の owner、bob は suzuki の owner
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
  readonly role: Role;
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

/** サービスごとの割り当て */
export interface SeedServiceMembership {
  readonly tenantSlug: string;
  readonly clientId: string;
  readonly username: string;
  readonly role: Role;
}

/** サービス固有の権限の上書き。business.member_permissions */
export interface SeedPermissionOverride {
  readonly tenantSlug: string;
  readonly clientId: string;
  readonly username: string;
  readonly permission: string;
  readonly effect: "allow" | "deny";
}

export interface SeedProject {
  readonly id: string;
  readonly tenantSlug: string;
  readonly name: string;
  readonly createdBy: string;
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
  { tenantSlug: "tanaka", clientId: "crm", username: "alice", role: "owner" },
  { tenantSlug: "tanaka", clientId: "cms", username: "alice", role: "owner" },
  { tenantSlug: "suzuki", clientId: "crm", username: "alice", role: "viewer" },
  { tenantSlug: "suzuki", clientId: "crm", username: "bob", role: "admin" },
];

export const SEED_PERMISSION_OVERRIDES: ReadonlyArray<SeedPermissionOverride> = [
  {
    tenantSlug: "tanaka",
    clientId: "cms",
    username: "alice",
    permission: "projects:write",
    effect: "deny",
  },
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
