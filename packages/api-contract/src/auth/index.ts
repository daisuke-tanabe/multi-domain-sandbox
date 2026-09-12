import { z } from "zod";
import { emailSchema, idSchema, personNameSchema } from "../common/index.ts";

/**
 * auth-api の SPA 向け /api/*。ログイン、ポータル、Global Logout の画面の材料。
 * 資格情報の送信は HTML フォーム POST なので契約には含めない
 */
export const loginContextResponseSchema = z.object({
  /** 認可リクエスト ID。ポータル用ログインでは空文字 */
  rid: z.string(),
  csrfToken: z.string(),
  errorMessage: z.string().optional(),
});
export type LoginContextResponse = z.infer<typeof loginContextResponseSchema>;

/** rid なしで SSO Session が既にあるときは画面を出さずポータルへ */
export const loginRedirectResponseSchema = z.object({ redirectTo: z.string() });
export type LoginRedirectResponse = z.infer<typeof loginRedirectResponseSchema>;

export const loginApiResponseSchema = z.union([
  loginRedirectResponseSchema,
  loginContextResponseSchema,
]);
export type LoginApiResponse = z.infer<typeof loginApiResponseSchema>;

export const portalServiceSchema = z.object({
  name: z.string(),
  clientId: z.string(),
  /** サービス側の /auth/login。SSO Session によりパスワードなしで入れる */
  loginUrl: z.string(),
});
export const portalTenantSchema = z.object({
  slug: z.string(),
  name: z.string(),
  services: z.array(portalServiceSchema),
});
export const portalResponseSchema = z.object({
  email: z.string(),
  tenants: z.array(portalTenantSchema),
});
export type PortalResponse = z.infer<typeof portalResponseSchema>;

export const logoutReturnToSchema = z.object({ label: z.string(), href: z.string() });
export const logoutResponseSchema = z.object({
  authenticated: z.boolean(),
  csrfToken: z.string().optional(),
  returnTo: logoutReturnToSchema.optional(),
});
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

/**
 * auth-api の管理 API /admin/service-members。サービスの api がサーバー間で呼ぶ
 */
export const serviceMemberUserSchema = z.object({
  id: idSchema,
  email: z.string(),
  name: z.string().nullable(),
  /** 一度でもログインして Cognito の sub が紐付いているか */
  linked: z.boolean(),
});
export type ServiceMemberUser = z.infer<typeof serviceMemberUserSchema>;

export const serviceMemberSchema = serviceMemberUserSchema.extend({
  status: z.enum(["active", "disabled"]),
});
export type ServiceMember = z.infer<typeof serviceMemberSchema>;

export const inviteServiceMemberInputSchema = z.object({
  tenant_id: idSchema,
  email: emailSchema,
  name: personNameSchema.optional(),
});
export type InviteServiceMemberInput = z.infer<typeof inviteServiceMemberInputSchema>;

export const inviteServiceMemberResponseSchema = z.object({ user: serviceMemberUserSchema });
export type InviteServiceMemberResponse = z.infer<typeof inviteServiceMemberResponseSchema>;

export const revokeServiceMemberInputSchema = z.object({
  tenant_id: idSchema,
  user_id: idSchema,
});
export type RevokeServiceMemberInput = z.infer<typeof revokeServiceMemberInputSchema>;

export const serviceMembersResponseSchema = z.object({ members: z.array(serviceMemberSchema) });
export type ServiceMembersResponse = z.infer<typeof serviceMembersResponseSchema>;
