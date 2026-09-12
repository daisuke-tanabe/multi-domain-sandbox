import { z } from "zod";
import { emailSchema, idSchema, personNameSchema } from "../common/index.ts";

/**
 * api-core が全サービスに提供する /v1/me と /v1/members。
 * 役割名と権限名はサービス定義で決まるため、ここでは文字列にしてサーバー側で refine する
 */
export const roleNameSchema = z.string().min(1).max(32);
export const permissionNameSchema = z.string().min(1).max(64);

export const meResponseSchema = z.object({
  user: z.object({ id: idSchema, email: z.string().nullable(), name: z.string().nullable() }),
  tenant: z.object({ id: idSchema, slug: z.string() }),
  role: roleNameSchema,
  permissions: z.array(permissionNameSchema),
  service: z.object({
    clientId: z.string(),
    roles: z.array(roleNameSchema),
    permissions: z.array(permissionNameSchema),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const memberStatusSchema = z.enum(["active", "disabled"]);

export const memberSchema = z.object({
  user_id: idSchema,
  email: z.string().nullable(),
  name: z.string().nullable(),
  role: roleNameSchema,
  status: memberStatusSchema,
});
export type Member = z.infer<typeof memberSchema>;

export const permissionOverrideSchema = z.object({
  permission: permissionNameSchema,
  effect: z.enum(["allow", "deny"]),
});
export type PermissionOverride = z.infer<typeof permissionOverrideSchema>;

export const membersResponseSchema = z.object({ members: z.array(memberSchema) });
export type MembersResponse = z.infer<typeof membersResponseSchema>;

export const memberDetailResponseSchema = z.object({
  member: memberSchema,
  overrides: z.array(permissionOverrideSchema),
  permissions: z.array(permissionNameSchema),
});
export type MemberDetailResponse = z.infer<typeof memberDetailResponseSchema>;

export const inviteMemberInputSchema = z.object({
  email: emailSchema,
  name: personNameSchema.optional(),
  role: roleNameSchema,
});
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;

export const inviteMemberResponseSchema = z.object({
  member: memberSchema,
  /** 一度でもログインして Cognito の sub が紐付いているか */
  linked: z.boolean(),
});
export type InviteMemberResponse = z.infer<typeof inviteMemberResponseSchema>;

export const memberPatchSchema = z.object({ role: roleNameSchema });
export type MemberPatch = z.infer<typeof memberPatchSchema>;

export const memberResponseSchema = z.object({ member: memberSchema });
export type MemberResponse = z.infer<typeof memberResponseSchema>;

export const permissionOverridesInputSchema = z.object({
  overrides: z.array(permissionOverrideSchema).max(50),
});
export type PermissionOverridesInput = z.infer<typeof permissionOverridesInputSchema>;

export const permissionOverridesResponseSchema = z.object({
  overrides: z.array(permissionOverrideSchema),
  permissions: z.array(permissionNameSchema),
});
export type PermissionOverridesResponse = z.infer<typeof permissionOverridesResponseSchema>;
