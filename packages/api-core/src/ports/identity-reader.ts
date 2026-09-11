import type { MembershipStatus, Role, TenantStatus, UserStatus } from "@sandbox/shared";

/**
 * Identity DB の読み取り専用ポート。API Server は書き込まない。
 */
export interface IdentityUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly status: UserStatus;
}

export interface IdentityTenant {
  readonly id: string;
  readonly slug: string;
  readonly status: TenantStatus;
}

/** このテナントのこのサービスへの割り当て。tenant_service_members */
export interface IdentityMembership {
  readonly role: Role;
  readonly status: MembershipStatus;
}

/** Access Token の sub / tenant_id / client_id に対応する行。存在しないものは undefined */
export interface AccessContext {
  readonly user: IdentityUser | undefined;
  readonly tenant: IdentityTenant | undefined;
  readonly membership: IdentityMembership | undefined;
}

export interface IdentityReader {
  /** 1 リクエストにつき 1 回、user / tenant / このサービスへの割り当てをまとめて引く */
  findAccessContext(userId: string, tenantId: string, clientId: string): Promise<AccessContext>;
}
