import { z } from "zod";
import { idSchema } from "../common/index.ts";

/**
 * web-core の BFF が SPA に返す /session。Token は含めない
 */
const sessionBaseSchema = z.object({
  service: z.object({ clientId: z.string(), name: z.string() }),
  tenant: z.object({ slug: z.string() }),
  urls: z.object({ login: z.string(), logout: z.string(), globalLogout: z.string() }),
});

export const sessionResponseSchema = z.discriminatedUnion("authenticated", [
  sessionBaseSchema.extend({ authenticated: z.literal(false) }),
  sessionBaseSchema.extend({
    authenticated: z.literal(true),
    user: z.object({ id: idSchema, email: z.string().nullable(), name: z.string().nullable() }),
    csrfToken: z.string(),
  }),
]);
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type AuthenticatedSession = Extract<SessionResponse, { authenticated: true }>;
