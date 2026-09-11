export { createApiApp, type ApiAppOptions } from "./app.ts";
export { loadApiCoreConfig, type ApiCoreConfig } from "./config.ts";
export { startApiCore, type ServiceApiSpec } from "./start.ts";
export { withTenant } from "./db.ts";
export { PgMemberRepository } from "./adapters/pg-member-repository.ts";
export { MemoryMemberRepository } from "./adapters/memory-member-repository.ts";
export { HttpAuthAdminClient } from "./adapters/auth-admin-client.ts";
export { MemoryAuthAdminClient } from "./adapters/memory-auth-admin.ts";
export { authenticate, requirePermission, forbidden, type ApiEnv } from "./auth/middleware.ts";
export {
  defineService,
  allPermissions,
  resolvePermissions,
  MEMBER_PERMISSIONS,
  type ServiceDefinition,
  type MemberPermission,
} from "./service-definition.ts";
export type {
  Member,
  MemberRepository,
  MemberStatus,
  PermissionOverride,
  PermissionEffect,
  TenantContext,
} from "./ports/member-repository.ts";
export type { AuthAdminClient, AuthAdminError, InvitedUser } from "./ports/auth-admin.ts";
