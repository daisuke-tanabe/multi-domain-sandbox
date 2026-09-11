import { err, matchRedirectUriTemplate, ok, type Result } from "@sandbox/shared";
import { SUPPORTED_SCOPES } from "../policy.ts";
import type { IdentityRepository, OidcClient, Tenant } from "../ports/identity-repository.ts";

export interface ValidatedAuthorizationRequest {
  readonly client: OidcClient;
  readonly redirectUri: string;
  /** redirect_uri のテナント部分から決まるテナント */
  readonly tenant: Tenant;
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
): Result<never, AuthorizationRequestError> {
  return err({ redirectable: true, kind, redirectUri, state, description });
}

/**
 * /authorize のパラメータを検証する。docs/design/02-auth-sequences.md の 3.1 に対応する。
 * テナントは redirect_uri をサービスのテンプレートに当てて決める。展開結果との完全一致なので改ざんできない。
 * テンプレートに一致しても tenants に無い slug は未登録の redirect_uri として扱い、リダイレクトしない。
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
  const tenantSlug =
    redirectUri === undefined
      ? undefined
      : matchRedirectUriTemplate(client.redirectUriTemplate, redirectUri);
  const tenant = tenantSlug === undefined ? undefined : await identity.findTenantBySlug(tenantSlug);
  if (redirectUri === undefined || tenant === undefined) {
    return err({ redirectable: false, kind: "invalid_redirect_uri" });
  }

  const state = params.state;
  if (params.response_type !== "code") {
    return redirectableError(
      "unsupported_response_type",
      redirectUri,
      state,
      "response_type must be code",
    );
  }
  if (state === undefined || state === "") {
    return redirectableError("invalid_request", redirectUri, state, "state is required");
  }
  const nonce = params.nonce;
  if (nonce === undefined || nonce === "") {
    return redirectableError("invalid_request", redirectUri, state, "nonce is required");
  }
  if (params.code_challenge_method !== PKCE_METHOD) {
    return redirectableError(
      "invalid_request",
      redirectUri,
      state,
      "code_challenge_method must be S256",
    );
  }
  const codeChallenge = params.code_challenge;
  if (codeChallenge === undefined || !CODE_CHALLENGE_PATTERN.test(codeChallenge)) {
    return redirectableError("invalid_request", redirectUri, state, "code_challenge is invalid");
  }

  const requestedScopes = (params.scope ?? "").split(" ").filter((scope) => scope !== "");
  if (!requestedScopes.includes("openid")) {
    return redirectableError("invalid_scope", redirectUri, state, "scope must include openid");
  }
  const unsupported = requestedScopes.find(
    (scope) => !SUPPORTED_SCOPES.includes(scope) || !client.allowedScopes.includes(scope),
  );
  if (unsupported !== undefined) {
    return redirectableError(
      "invalid_scope",
      redirectUri,
      state,
      `scope ${unsupported} is not allowed`,
    );
  }

  return ok({
    client,
    redirectUri,
    tenant,
    scope: requestedScopes.join(" "),
    state,
    nonce,
    codeChallenge,
  });
}
