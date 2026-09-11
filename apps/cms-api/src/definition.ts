import { defineService } from "@sandbox/api-core";

/**
 * CMS の役割と権限。CRM とは語彙が違う。
 */
export const CMS_PERMISSIONS = [
  "posts:read",
  "posts:create",
  "posts:update",
  "posts:delete",
] as const;

export type CmsPermission = (typeof CMS_PERMISSIONS)[number];

export const CMS = defineService({
  roles: ["owner", "editor", "viewer"] as const,
  defaultRole: "viewer",
  permissions: CMS_PERMISSIONS,
  rolePermissions: {
    owner: [...CMS_PERMISSIONS, "members:read", "members:invite", "members:manage"],
    editor: [...CMS_PERMISSIONS, "members:read"],
    viewer: ["posts:read", "members:read"],
  },
});

export const CMS_SCHEMA = "cms";
