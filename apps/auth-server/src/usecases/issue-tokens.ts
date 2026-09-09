import { randomToken, signJwt } from "@sandbox/shared";
import { ACCESS_TOKEN_TTL_SECONDS, ID_TOKEN_TTL_SECONDS } from "../policy.ts";
import type { User } from "../ports/identity-repository.ts";
import type { AuthDeps } from "./deps.ts";

export interface IssueTokensInput {
  readonly clientId: string;
  readonly user: User;
  readonly scope: string;
  readonly nonce: string | undefined;
  readonly sid: string;
  readonly tenantId: string | null;
  readonly authTime: number;
}

export interface IssuedTokens {
  readonly idToken: string;
  readonly accessToken: string;
  readonly expiresIn: number;
}

function profileClaims(user: User, scopes: ReadonlyArray<string>): Record<string, unknown> {
  return {
    ...(scopes.includes("email") && { email: user.email, email_verified: true }),
    ...(scopes.includes("profile") && user.name !== null && { name: user.name }),
  };
}

/**
 * Auth Server 自身の鍵で ID Token と Access Token を署名する。docs/design/04-token-design.md に対応する。
 * sub は内部の users.id。Cognito の sub は境界の外へ出さない。
 */
export async function issueTokens(deps: AuthDeps, input: IssueTokensInput): Promise<IssuedTokens> {
  const now = deps.clock.nowSeconds();
  const scopes = input.scope.split(" ");
  const tenantClaim = input.tenantId === null ? {} : { tenant_id: input.tenantId };

  const idToken = await signJwt(deps.signingKey, {
    issuer: deps.issuer,
    audience: input.clientId,
    subject: input.user.id,
    issuedAt: now,
    expiresAt: now + ID_TOKEN_TTL_SECONDS,
    claims: {
      auth_time: input.authTime,
      sid: input.sid,
      ...(input.nonce !== undefined && { nonce: input.nonce }),
      ...tenantClaim,
      ...profileClaims(input.user, scopes),
    },
  });

  // aud に issuer も含め、/userinfo でも同じ Access Token を受け付ける
  const accessToken = await signJwt(deps.signingKey, {
    issuer: deps.issuer,
    audience: [deps.apiAudience, deps.issuer],
    subject: input.user.id,
    issuedAt: now,
    expiresAt: now + ACCESS_TOKEN_TTL_SECONDS,
    claims: {
      client_id: input.clientId,
      sid: input.sid,
      scope: input.scope,
      jti: randomToken(16),
      ...tenantClaim,
    },
  });

  return { idToken, accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}
