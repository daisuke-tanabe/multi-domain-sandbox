import { Hono, type Context } from "hono";
import { randomToken, type CookiePolicy } from "@sandbox/shared";
import { AUTHORIZATION_REQUEST_TTL_SECONDS } from "../policy.ts";
import {
  validateAuthorizationRequest,
  type AuthorizationRequestError,
} from "../usecases/authorization-request.ts";
import { authorizeWithSession } from "../usecases/authorize.ts";
import type { AuthDeps } from "../usecases/deps.ts";
import { loadSsoSession } from "../usecases/sso-session.ts";
import { errorPage } from "../views/pages.ts";
import { buildRedirect, clearSsoCookie, noStore, readSsoCookie } from "./helpers.ts";

/**
 * GET /authorize。docs/design/02-auth-sequences.md の 3.1 に対応する。
 */
export function authorizeRoutes(deps: AuthDeps, policy: CookiePolicy): Hono {
  const app = new Hono();

  app.get("/authorize", async (c) => {
    noStore(c);
    const validated = await validateAuthorizationRequest(deps.identity, c.req.query());
    if (!validated.ok) return respondValidationError(c, deps, validated.error);
    const request = validated.value;

    const sessionId = readSsoCookie(c, policy);
    const session = await loadSsoSession(deps, sessionId);
    if (session === undefined) {
      if (sessionId !== undefined) clearSsoCookie(c, policy);
      const rid = randomToken();
      await deps.stores.authorizationRequests.set(
        rid,
        {
          rid,
          clientId: request.client.clientId,
          redirectUri: request.redirectUri,
          scope: request.scope,
          state: request.state,
          nonce: request.nonce,
          codeChallenge: request.codeChallenge,
          createdAt: deps.clock.nowSeconds(),
        },
        AUTHORIZATION_REQUEST_TTL_SECONDS,
      );
      return c.redirect(`/login?rid=${encodeURIComponent(rid)}`);
    }

    const outcome = await authorizeWithSession(deps, request, session);
    if (!outcome.ok) {
      return c.redirect(
        buildRedirect(request.redirectUri, deps.issuer, {
          error: "access_denied",
          state: request.state,
        }),
      );
    }
    return c.redirect(
      buildRedirect(outcome.value.redirectUri, deps.issuer, {
        code: outcome.value.code,
        state: outcome.value.state,
      }),
    );
  });

  return app;
}

function respondValidationError(
  c: Context,
  deps: AuthDeps,
  error: AuthorizationRequestError,
): Response | Promise<Response> {
  if (!error.redirectable) {
    // client_id と redirect_uri が確定しないため、どこにもリダイレクトしない
    deps.logger.warn("authorize rejected without redirect", { kind: error.kind });
    return c.html(
      errorPage(
        "無効なリクエストです",
        "ログイン要求の内容が正しくありません。サービスからやり直してください。",
      ),
      400,
    );
  }
  deps.logger.info("authorize rejected", { kind: error.kind, description: error.description });
  return c.redirect(
    buildRedirect(error.redirectUri, deps.issuer, {
      error: error.kind,
      error_description: error.description,
      state: error.state,
    }),
  );
}
