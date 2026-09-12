import { computeCodeChallenge, generateCodeVerifier } from "@sandbox/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createHarness, TANAKA_CRM_REDIRECT, type TestHarness } from "../../test-support.ts";
import { validateAuthorizationRequest } from "./authorization-request.ts";

function baseParams(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    response_type: "code",
    client_id: "crm",
    redirect_uri: TANAKA_CRM_REDIRECT,
    scope: "openid profile email",
    state: "s",
    nonce: "n",
    code_challenge: computeCodeChallenge(generateCodeVerifier()),
    code_challenge_method: "S256",
    ...overrides,
  };
}

describe("validateAuthorizationRequest", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  test("accepts a well-formed request and normalizes scope", async () => {
    // Arrange
    const params = baseParams({ scope: "openid  email" });

    // Act
    const result = await validateAuthorizationRequest(harness.identity, params);

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scope).toBe("openid email");
    expect(result.value.client.clientId).toBe("crm");
  });

  test("rejects unknown client without redirect", async () => {
    const result = await validateAuthorizationRequest(
      harness.identity,
      baseParams({ client_id: "nope" }),
    );
    expect(result).toEqual({ ok: false, error: { redirectable: false, kind: "invalid_client" } });
  });

  test.each([
    ["different host", "http://evil.example/auth/callback"],
    ["trailing slash", `${TANAKA_CRM_REDIRECT}/`],
    ["extra query", `${TANAKA_CRM_REDIRECT}?x=1`],
    ["upper case", TANAKA_CRM_REDIRECT.toUpperCase()],
  ])(
    "rejects redirect_uri that is not an exact match (%s) without redirect",
    async (_label, redirectUri) => {
      const result = await validateAuthorizationRequest(
        harness.identity,
        baseParams({ redirect_uri: redirectUri }),
      );
      expect(result).toEqual({
        ok: false,
        error: { redirectable: false, kind: "invalid_redirect_uri" },
      });
    },
  );

  test("rejects response_type other than code with a redirectable error", async () => {
    const result = await validateAuthorizationRequest(
      harness.identity,
      baseParams({ response_type: "token" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.redirectable).toBe(true);
    expect(result.error.kind).toBe("unsupported_response_type");
  });

  test.each([
    ["missing state", { state: undefined }],
    ["missing nonce", { nonce: undefined }],
    ["plain pkce", { code_challenge_method: "plain" }],
    ["missing code_challenge", { code_challenge: undefined }],
  ])("rejects %s as invalid_request", async (_label, overrides) => {
    const result = await validateAuthorizationRequest(harness.identity, baseParams(overrides));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_request");
  });

  test("rejects scope without openid", async () => {
    const result = await validateAuthorizationRequest(
      harness.identity,
      baseParams({ scope: "profile" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_scope");
  });

  test("rejects scope that the client is not allowed to request", async () => {
    const result = await validateAuthorizationRequest(
      harness.identity,
      baseParams({ scope: "openid admin" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_scope");
  });
});
