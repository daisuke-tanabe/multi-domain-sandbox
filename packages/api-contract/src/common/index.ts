import { z } from "zod";

/** すべての API に共通するエラー応答。code は経路ごとに文書化する */
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** 識別子。ULID を TEXT で持つ */
export const idSchema = z.string().min(1).max(64);

export const emailSchema = z.string().email().max(254);
export const personNameSchema = z.string().trim().min(1).max(100);
