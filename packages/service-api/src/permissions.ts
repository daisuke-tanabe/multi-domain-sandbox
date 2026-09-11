import type { Role } from "./ports/identity-reader.ts";

/**
 * Role → Permission の対応表。docs/design/07-api-auth-design.md に対応する。
 * DB には role のみ保存し、細粒度の権限はここで解決する。
 */
export const PERMISSIONS = [
  "tenant:read",
  "tenant:update",
  "tenant:delete",
  "members:read",
  "members:write",
  "projects:read",
  "projects:write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set(PERMISSIONS),
  admin: new Set([
    "tenant:read",
    "tenant:update",
    "members:read",
    "members:write",
    "projects:read",
    "projects:write",
  ]),
  member: new Set(["tenant:read", "projects:read", "projects:write"]),
  viewer: new Set(["tenant:read", "projects:read"]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
