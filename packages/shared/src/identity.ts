import { z } from "zod";

/**
 * Identity DB の列挙値。db/identity/init/002_identity.sql の CHECK 制約と一致させる。
 * サービス内の役割はここに置かず、各サービスの ServiceDefinition が持つ。
 */
export const USER_STATUSES = ["active", "disabled"] as const;
export const TENANT_STATUSES = ["active", "suspended"] as const;
export const CONTRACT_STATUSES = ["active", "suspended"] as const;
export const CLIENT_STATUSES = ["active", "disabled"] as const;
export const SERVICE_MEMBERSHIP_STATUSES = ["active", "disabled"] as const;
/** MFA の方式。初期は TOTP だけで、Passkey などはここに足す */
export const MFA_METHODS = ["totp"] as const;

export type UserStatus = (typeof USER_STATUSES)[number];
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type ServiceMembershipStatus = (typeof SERVICE_MEMBERSHIP_STATUSES)[number];
export type MfaMethod = (typeof MFA_METHODS)[number];

export const userStatusSchema = z.enum(USER_STATUSES);
export const tenantStatusSchema = z.enum(TENANT_STATUSES);
export const contractStatusSchema = z.enum(CONTRACT_STATUSES);
export const clientStatusSchema = z.enum(CLIENT_STATUSES);
export const serviceMembershipStatusSchema = z.enum(SERVICE_MEMBERSHIP_STATUSES);
export const mfaMethodSchema = z.enum(MFA_METHODS);
