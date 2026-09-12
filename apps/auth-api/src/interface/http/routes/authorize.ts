import { Hono, type Context } from "hono";
import type { CookiePolicy } from "@sandbox/shared";
import {
  validateAuthorizationRequest,
  type AuthorizationRequestError,
} from "../../../application/usecases/authorization-request.ts";
import { authorizeWithSession } from "../../../application/usecases/authorize.ts";
import type { AuthDeps } from "../../../application/deps.ts";
import { storePendingAuthorization } from "../../../application/usecases/pending-authorization.ts";
import { loadSsoSession } from "../../../application/usecases/sso-session.ts";
import { errorPage } from "../views/pages.ts";
import {
  buildRedirect,
  clearSsoCookie,
  noStore,
  readSsoCookie,
  redirectForOutcome,
  requestEnvironment,
} from "./helpers.ts";

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
      const rid = await storePendingAuthorization(deps, request);
      return c.redirect(`/login?rid=${encodeURIComponent(rid)}`);
    }

    const outcome = await authorizeWithSession(deps, request, session, requestEnvironment(c));
    return c.redirect(redirectForOutcome(deps.issuer, request, outcome));
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
