export { createApiApp, type ApiAppOptions } from "./interface/http/app.ts";
export { loadApiCoreConfig, type ApiCoreConfig } from "./config.ts";
export { startApiCore, type ServiceApiSpec } from "./start.ts";
export { withTenant } from "./infrastructure/db.ts";
export { PgMemberRepository } from "./infrastructure/pg-member-repository.ts";
export { MemoryMemberRepository } from "./infrastructure/memory-member-repository.ts";
export { HttpAuthAdminClient } from "./infrastructure/auth-admin-client.ts";
export { MemoryAuthAdminClient } from "./infrastructure/memory-auth-admin.ts";
export {
  authenticate,
  requirePermission,
  forbidden,
  invalidJson,
  notFoundResponse,
  type ApiEnv,
} from "./interface/http/middleware.ts";
export {
  defineService,
  allPermissions,
  resolvePermissions,
  MEMBER_PERMISSIONS,
  type ServiceDefinition,
  type MemberPermission,
} from "./domain/service-definition.ts";
export type {
  Member,
  MemberStatus,
  PermissionOverride,
  PermissionEffect,
  TenantContext,
} from "./domain/member.ts";
export type {
  MemberRepository,
  MemberWithOverrides,
} from "./application/ports/member-repository.ts";
export type {
  AuthAdminClient,
  AuthAdminError,
  InvitedUser,
} from "./application/ports/auth-admin.ts";
