import type { Role } from "@sandbox/shared";
import type { PermissionOverride } from "./ports/permission-reader.ts";

/**
 * Role → Permission の対応表。docs/design/07-api-auth-design.md に対応する。
 * Identity DB には役割だけを保存し、細かい権限はここで解決した既定に
 * サービス自身の DB (member_permissions) の上書きを重ねる。
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

const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlyArray<Permission>>> = {
  owner: PERMISSIONS,
  admin: [
    "tenant:read",
    "tenant:update",
    "members:read",
    "members:write",
    "projects:read",
    "projects:write",
  ],
  member: ["tenant:read", "projects:read", "projects:write"],
  viewer: ["tenant:read", "projects:read"],
};

function isPermission(value: string): value is Permission {
  return (PERMISSIONS as ReadonlyArray<string>).includes(value);
}

/**
 * 役割の既定に上書きを適用した権限の集合。deny は allow より優先する。
 * 未知の permission 名の上書きは無視する。
 */
export function resolvePermissions(
  role: Role,
  overrides: ReadonlyArray<PermissionOverride>,
): ReadonlySet<Permission> {
  const granted = new Set<Permission>(ROLE_PERMISSIONS[role]);
  for (const override of overrides) {
    if (override.effect === "allow" && isPermission(override.permission)) {
      granted.add(override.permission);
    }
  }
  for (const override of overrides) {
    if (override.effect === "deny" && isPermission(override.permission)) {
      granted.delete(override.permission);
    }
  }
  return granted;
}
