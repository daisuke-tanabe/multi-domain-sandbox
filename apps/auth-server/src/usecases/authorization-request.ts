import { err, ok, type Result } from "@sandbox/shared";
import { SUPPORTED_SCOPES } from "../policy.ts";
import type { IdentityRepository, OidcClient } from "../ports/identity-repository.ts";

export interface ValidatedAuthorizationRequest {
  readonly client: OidcClient;
  readonly redirectUri: string;
  readonly scope: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
}

/**
 * redirect 可否で分ける。client と redirect_uri が確定するまでは絶対にリダイレクトしない。
 */
export type AuthorizationRequestError =
  | { readonly redirectable: false; readonly kind: "invalid_client" | "invalid_redirect_uri" }
  | {
      readonly redirectable: true;
      readonly kind: "invalid_request" | "unsupported_response_type" | "invalid_scope";
      readonly redirectUri: string;
      readonly state: string | undefined;
      readonly description: string;
    };

type RawParams = Readonly<Record<string, string | undefined>>;

const PKCE_METHOD = "S256";
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function redirectableError(
  kind: "invalid_request" | "unsupported_response_type" | "invalid_scope",
  redirectUri: string,
  state: string | undefined,
  description: string,
): AuthorizationRequestError {
  return { redirectable: true, kind, redirectUri, state, description };
}

/**
 * /authorize のパラメータを検証する。docs/design/02-auth-sequences.md の 3.1 に対応する。
 */
export async function validateAuthorizationRequest(
  identity: IdentityRepository,
  params: RawParams,
): Promise<Result<ValidatedAuthorizationRequest, AuthorizationRequestError>> {
  const clientId = params.client_id;
  if (clientId === undefined || clientId === "")
    return err({ redirectable: false, kind: "invalid_client" });

  const client = await identity.findClient(clientId);
  if (client === undefined || client.status !== "active")
    return err({ redirectable: false, kind: "invalid_client" });

  const redirectUri = params.redirect_uri;
  // 完全一致のみ。正規化はしない
  if (redirectUri === undefined || !client.redirectUris.includes(redirectUri)) {
    return err({ redirectable: false, kind: "invalid_redirect_uri" });
  }

  const state = params.state;
  if (params.response_type !== "code") {
    return err(
      redirectableError(
        "unsupported_response_type",
        redirectUri,
        state,
        "response_type must be code",
      ),
    );
  }
  if (state === undefined || state === "") {
    return err(redirectableError("invalid_request", redirectUri, state, "state is required"));
  }
  const nonce = params.nonce;
  if (nonce === undefined || nonce === "") {
    return err(redirectableError("invalid_request", redirectUri, state, "nonce is required"));
  }
  if (params.code_challenge_method !== PKCE_METHOD) {
    return err(
      redirectableError(
        "invalid_request",
        redirectUri,
        state,
        "code_challenge_method must be S256",
      ),
    );
  }
  const codeChallenge = params.code_challenge;
  if (codeChallenge === undefined || !CODE_CHALLENGE_PATTERN.test(codeChallenge)) {
    return err(
      redirectableError("invalid_request", redirectUri, state, "code_challenge is invalid"),
    );
  }

  const requestedScopes = (params.scope ?? "").split(" ").filter((scope) => scope !== "");
  if (!requestedScopes.includes("openid")) {
    return err(redirectableError("invalid_scope", redirectUri, state, "scope must include openid"));
  }
  const supported: ReadonlyArray<string> = SUPPORTED_SCOPES;
  const unsupported = requestedScopes.find(
    (scope) => !supported.includes(scope) || !client.allowedScopes.includes(scope),
  );
  if (unsupported !== undefined) {
    return err(
      redirectableError("invalid_scope", redirectUri, state, `scope ${unsupported} is not allowed`),
    );
  }

  return ok({ client, redirectUri, scope: requestedScopes.join(" "), state, nonce, codeChallenge });
}
