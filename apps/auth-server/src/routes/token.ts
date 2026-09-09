import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthDeps } from "../usecases/deps.ts";
import {
  authenticateClient,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeRefreshToken,
} from "../usecases/token.ts";
import { noStore } from "./helpers.ts";

const tokenFormSchema = z.object({
  grant_type: z.string().min(1),
  code: z.string().optional(),
  redirect_uri: z.string().optional(),
  code_verifier: z.string().optional(),
  refresh_token: z.string().optional(),
});

const revokeFormSchema = z.object({
  token: z.string().min(1),
  token_type_hint: z.string().optional(),
});

/**
 * POST /token と POST /revoke。Back Channel 専用。
 */
export function tokenRoutes(deps: AuthDeps): Hono {
  const app = new Hono();

  app.post(
    "/token",
    zValidator("form", tokenFormSchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_request" }, 400);
      return undefined;
    }),
    async (c) => {
      noStore(c);
      const client = await authenticateClient(deps.identity, c.req.header("Authorization"));
      if (!client.ok) {
        c.header("WWW-Authenticate", 'Basic realm="token"');
        return c.json({ error: "invalid_client" }, 401);
      }

      const form = c.req.valid("form");
      switch (form.grant_type) {
        case "authorization_code": {
          const result = await exchangeAuthorizationCode(deps, client.value, {
            code: form.code,
            redirectUri: form.redirect_uri,
            codeVerifier: form.code_verifier,
          });
          if (!result.ok) {
            deps.logger.info("token exchange rejected", {
              clientId: client.value.clientId,
              reason: result.error.reason,
            });
            return c.json({ error: "invalid_grant" }, 400);
          }
          return c.json(result.value);
        }
        case "refresh_token": {
          const result = await refreshAccessToken(deps, client.value, form.refresh_token);
          if (!result.ok) {
            deps.logger.info("refresh rejected", {
              clientId: client.value.clientId,
              reason: result.error.reason,
            });
            return c.json({ error: "invalid_grant" }, 400);
          }
          return c.json(result.value);
        }
        default:
          return c.json({ error: "unsupported_grant_type" }, 400);
      }
    },
  );

  app.post(
    "/revoke",
    zValidator("form", revokeFormSchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_request" }, 400);
      return undefined;
    }),
    async (c) => {
      noStore(c);
      const client = await authenticateClient(deps.identity, c.req.header("Authorization"));
      if (!client.ok) {
        c.header("WWW-Authenticate", 'Basic realm="revoke"');
        return c.json({ error: "invalid_client" }, 401);
      }
      await revokeRefreshToken(deps, client.value, c.req.valid("form").token);
      return c.body(null, 200);
    },
  );

  return app;
}
