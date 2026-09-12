import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthDeps } from "../../../application/deps.ts";
import {
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeRefreshToken,
} from "../../../application/usecases/token.ts";
import { clientAuth, type ClientEnv } from "./client-auth.ts";
import { invalidJson } from "./helpers.ts";

const tokenFormSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    redirect_uri: z.string().min(1),
    code_verifier: z.string().min(1),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
  }),
]);

const revokeFormSchema = z.object({
  token: z.string().min(1),
  token_type_hint: z.string().optional(),
});

/**
 * POST /token と POST /revoke。Back Channel 専用。
 */
export function tokenRoutes(deps: AuthDeps): Hono<ClientEnv> {
  const app = new Hono<ClientEnv>();

  app.post(
    "/token",
    clientAuth(deps, "token"),
    zValidator("form", tokenFormSchema, (result, c) => {
      // grant_type が未知でも必須項目が欠けても invalid_request。未知の grant_type は別コードで返す
      if (!result.success) {
        const grantType = Reflect.get(result.data ?? {}, "grant_type");
        const known = grantType === "authorization_code" || grantType === "refresh_token";
        return c.json({ error: known ? "invalid_request" : "unsupported_grant_type" }, 400);
      }
      return undefined;
    }),
    async (c) => {
      const client = c.get("client");
      const form = c.req.valid("form");
      const result =
        form.grant_type === "authorization_code"
          ? await exchangeAuthorizationCode(deps, client, {
              code: form.code,
              redirectUri: form.redirect_uri,
              codeVerifier: form.code_verifier,
            })
          : await refreshAccessToken(deps, client, form.refresh_token);
      if (!result.ok) {
        deps.logger.info("token request rejected", {
          grantType: form.grant_type,
          clientId: client.clientId,
          reason: result.error.reason,
        });
        return c.json({ error: "invalid_grant" }, 400);
      }
      return c.json(result.value);
    },
  );

  app.post(
    "/revoke",
    clientAuth(deps, "revoke"),
    zValidator("form", revokeFormSchema, invalidJson),
    async (c) => {
      await revokeRefreshToken(deps, c.get("client"), c.req.valid("form").token);
      return c.body(null, 200);
    },
  );

  return app;
}
