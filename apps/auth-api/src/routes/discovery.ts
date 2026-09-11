import { Hono } from "hono";
import { SIGNING_ALGORITHM, toJwks } from "@sandbox/shared";
import { SUPPORTED_SCOPES } from "../policy.ts";
import type { AuthDeps } from "../usecases/deps.ts";

export function discoveryRoutes(deps: AuthDeps): Hono {
  const app = new Hono();

  app.get("/.well-known/openid-configuration", (c) =>
    c.json({
      issuer: deps.issuer,
      authorization_endpoint: `${deps.issuer}/authorize`,
      token_endpoint: `${deps.issuer}/token`,
      userinfo_endpoint: `${deps.issuer}/userinfo`,
      revocation_endpoint: `${deps.issuer}/revoke`,
      jwks_uri: `${deps.issuer}/jwks`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: [SIGNING_ALGORITHM],
      scopes_supported: [...SUPPORTED_SCOPES],
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      code_challenge_methods_supported: ["S256"],
      claims_supported: [
        "sub",
        "aud",
        "iss",
        "exp",
        "iat",
        "auth_time",
        "nonce",
        "sid",
        "tenant_id",
        "email",
        "email_verified",
        "name",
      ],
      authorization_response_iss_parameter_supported: true,
    }),
  );

  app.get("/jwks", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(toJwks([deps.signingKey]));
  });

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  return app;
}
