import { defineService } from "@sandbox/api-core";

/**
 * CRM の役割と権限。エンドユーザーの読み取りは誰でもできる。
 * マスク解除は owner と admin の既定。member / viewer は permission_overrides で個別に許可できる。
 */
export const CRM_PERMISSIONS = [
  "end_users:read",
  "end_users:create",
  "end_users:update",
  "end_users:delete",
  "end_users:unmask",
] as const;

export type CrmPermission = (typeof CRM_PERMISSIONS)[number];

export const CRM = defineService({
  roles: ["owner", "admin", "member", "viewer"] as const,
  defaultRole: "viewer",
  permissions: CRM_PERMISSIONS,
  rolePermissions: {
    owner: [...CRM_PERMISSIONS, "members:read", "members:invite", "members:manage"],
    admin: [...CRM_PERMISSIONS, "members:read", "members:invite"],
    member: ["end_users:read", "end_users:create", "end_users:update", "members:read"],
    viewer: ["end_users:read", "members:read"],
  },
});

export const CRM_SCHEMA = "crm";
