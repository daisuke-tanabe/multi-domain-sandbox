import { z } from "zod";

/**
 * Identity DB の列挙値。db/init/002_identity.sql の CHECK 制約と一致させる。
 * auth-api と resource-server の両方がここから型と zod スキーマを取る。
 */
export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export const USER_STATUSES = ["active", "disabled"] as const;
export const TENANT_STATUSES = ["active", "suspended"] as const;
export const MEMBERSHIP_STATUSES = ["active", "invited", "disabled"] as const;
export const CONTRACT_STATUSES = ["active", "suspended"] as const;
export const CLIENT_STATUSES = ["active", "disabled"] as const;

export type Role = (typeof ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const roleSchema = z.enum(ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);
export const tenantStatusSchema = z.enum(TENANT_STATUSES);
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export const contractStatusSchema = z.enum(CONTRACT_STATUSES);
export const clientStatusSchema = z.enum(CLIENT_STATUSES);
