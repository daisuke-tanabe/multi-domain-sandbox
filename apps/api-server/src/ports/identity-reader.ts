/**
 * Identity DB の読み取り専用ポート。API Server は書き込まない。
 */
export type Role = "owner" | "admin" | "member" | "viewer";

export interface IdentityUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly status: "active" | "disabled";
}

export interface IdentityTenant {
  readonly id: string;
  readonly slug: string;
  readonly status: "active" | "suspended";
}

export interface IdentityMembership {
  readonly role: Role;
  readonly status: "active" | "invited" | "disabled";
}

export interface IdentityReader {
  findUserById(id: string): Promise<IdentityUser | undefined>;
  findTenantById(id: string): Promise<IdentityTenant | undefined>;
  findMembership(tenantId: string, userId: string): Promise<IdentityMembership | undefined>;
}
