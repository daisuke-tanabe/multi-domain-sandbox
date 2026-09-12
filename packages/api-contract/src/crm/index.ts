import { z } from "zod";
import { emailSchema, idSchema } from "../common/index.ts";

/**
 * crm-api の /v1/end-users。CRM が管理するエンドユーザー。ログインする人ではなく顧客データ
 */
export const endUserInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  phone: z.string().trim().min(1).max(32),
  note: z.string().max(1000).default(""),
});
export type EndUserInput = z.infer<typeof endUserInputSchema>;

export const endUserPatchSchema = endUserInputSchema.partial();
export type EndUserPatch = z.infer<typeof endUserPatchSchema>;

export const endUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  note: z.string(),
  /** end_users:unmask がないとメールと電話はマスクした値 */
  masked: z.boolean(),
});
export type EndUser = z.infer<typeof endUserSchema>;

export const endUsersResponseSchema = z.object({
  end_users: z.array(endUserSchema),
  masked: z.boolean(),
});
export type EndUsersResponse = z.infer<typeof endUsersResponseSchema>;

export const endUserResponseSchema = z.object({ end_user: endUserSchema });
export type EndUserResponse = z.infer<typeof endUserResponseSchema>;
