import type { PermissionOverride } from "./member.ts";

/**
 * サービスごとの役割と権限の語彙。identity は「入れるか」しか持たないので、ここが認可の正。
 * 管理アカウントの招待と権限編集はどのサービスにも要るため、members:* は api-core が必ず足す。
 */
export const MEMBER_PERMISSIONS = ["members:read", "members:invite", "members:manage"] as const;
export type MemberPermission = (typeof MEMBER_PERMISSIONS)[number];

export interface ServiceDefinition<
  Role extends string = string,
  Permission extends string = string,
> {
  /** 上から順に強い役割。先頭が最上位 */
  readonly roles: ReadonlyArray<Role>;
  /** auth 経由で入れるが member 行が無い人に付ける役割。最下位にする */
  readonly defaultRole: Role;
  /** サービス固有の権限。members:* は含めない */
  readonly permissions: ReadonlyArray<Permission>;
  readonly rolePermissions: Readonly<Record<Role, ReadonlyArray<Permission | MemberPermission>>>;
}

/** 型推論のためだけの identity 関数 */
export function defineService<Role extends string, Permission extends string>(
  definition: ServiceDefinition<Role, Permission>,
): ServiceDefinition<Role, Permission> {
  return definition;
}

export function allPermissions(definition: ServiceDefinition): ReadonlyArray<string> {
  return [...definition.permissions, ...MEMBER_PERMISSIONS];
}

export function isRole(definition: ServiceDefinition, value: unknown): value is string {
  return typeof value === "string" && definition.roles.includes(value);
}

export function isPermission(definition: ServiceDefinition, value: unknown): value is string {
  return typeof value === "string" && allPermissions(definition).includes(value);
}

/**
 * 役割の既定に上書きを適用した権限の集合。deny は allow より優先する。
 * 未知の permission 名の上書きは無視する。
 */
export function resolvePermissions(
  definition: ServiceDefinition,
  role: string,
  overrides: ReadonlyArray<PermissionOverride>,
): ReadonlySet<string> {
  const granted = new Set<string>(definition.rolePermissions[role] ?? []);
  for (const override of overrides) {
    if (override.effect === "allow" && isPermission(definition, override.permission)) {
      granted.add(override.permission);
    }
  }
  for (const override of overrides) {
    if (override.effect === "deny") granted.delete(override.permission);
  }
  return granted;
}
