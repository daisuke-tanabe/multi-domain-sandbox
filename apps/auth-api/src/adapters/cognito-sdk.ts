import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  RevokeTokenCommand,
  type AuthenticationResultType,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  createSecretHash,
  createSrpSession,
  signSrpSession,
  wrapAuthChallenge,
  wrapInitiateAuth,
} from "cognito-srp-helper";
import {
  err,
  ok,
  RemoteJwksSource,
  verifyJwtWithSource,
  type Clock,
  type FetchLike,
  type Logger,
  type Result,
} from "@sandbox/shared";
import type {
  CognitoAuthenticated,
  CognitoAuthenticator,
  CognitoAuthError,
  CognitoCredentials,
} from "../ports/cognito.ts";

export interface SdkCognitoConfig {
  readonly region: string;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * 本番向け Cognito アダプタ。USER_SRP_AUTH でパスワードを平文送信せずに認証し、
 * 返ってきた ID Token を Cognito の JWKS で検証してから claims を返す。
 * docs/design/00-current-state-and-decisions.md の D5 に対応する。
 */
export class SdkCognitoAuthenticator implements CognitoAuthenticator {
  private readonly client: CognitoIdentityProviderClient;
  private readonly issuer: string;
  private readonly jwks: RemoteJwksSource;

  constructor(
    private readonly config: SdkCognitoConfig,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly fetchFn: FetchLike,
  ) {
    this.client = new CognitoIdentityProviderClient({ region: config.region });
    this.issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
    this.jwks = new RemoteJwksSource(`${this.issuer}/.well-known/jwks.json`, fetchFn, clock);
  }

  public async authenticate(
    credentials: CognitoCredentials,
  ): Promise<Result<CognitoAuthenticated, CognitoAuthError>> {
    const secretHash = createSecretHash(
      credentials.username,
      this.config.clientId,
      this.config.clientSecret,
    );
    try {
      const srpSession = createSrpSession(
        credentials.username,
        credentials.password,
        this.config.userPoolId,
        false,
      );
      const initiated = await this.client.send(
        new InitiateAuthCommand(
          wrapInitiateAuth(srpSession, {
            ClientId: this.config.clientId,
            AuthFlow: "USER_SRP_AUTH",
            AuthParameters: {
              CHALLENGE_NAME: "SRP_A",
              SECRET_HASH: secretHash,
              USERNAME: credentials.username,
            },
          } as const),
        ),
      );
      if (initiated.ChallengeName !== "PASSWORD_VERIFIER") {
        return err({
          kind: "challenge_required",
          challengeName: initiated.ChallengeName ?? "unknown",
        });
      }
      const challengeParameters = initiated.ChallengeParameters;
      if (challengeParameters === undefined) {
        return err({ kind: "unavailable", reason: "challenge parameters missing" });
      }
      const signed = signSrpSession(srpSession, {
        ChallengeName: "PASSWORD_VERIFIER",
        ChallengeParameters: challengeParameters,
      });
      const responded = await this.client.send(
        new RespondToAuthChallengeCommand(
          wrapAuthChallenge(signed, {
            ClientId: this.config.clientId,
            ChallengeName: "PASSWORD_VERIFIER",
            ChallengeResponses: { SECRET_HASH: secretHash, USERNAME: credentials.username },
            ...(initiated.Session !== undefined && { Session: initiated.Session }),
          } as const),
        ),
      );
      if (responded.ChallengeName !== undefined) {
        return err({ kind: "challenge_required", challengeName: responded.ChallengeName });
      }
      if (responded.AuthenticationResult === undefined) {
        return err({ kind: "unavailable", reason: "no authentication result" });
      }
      return this.toAuthenticated(responded.AuthenticationResult);
    } catch (error: unknown) {
      return err(mapCognitoError(error, this.logger));
    }
  }

  public async revokeRefreshToken(
    refreshToken: string,
  ): Promise<Result<void, { kind: "unavailable"; reason: string }>> {
    try {
      await this.client.send(
        new RevokeTokenCommand({
          ClientId: this.config.clientId,
          ClientSecret: this.config.clientSecret,
          Token: refreshToken,
        }),
      );
      return ok(undefined);
    } catch (error: unknown) {
      return err({ kind: "unavailable", reason: errorName(error) });
    }
  }

  private async toAuthenticated(
    result: AuthenticationResultType,
  ): Promise<Result<CognitoAuthenticated, CognitoAuthError>> {
    const { AccessToken, IdToken, RefreshToken, ExpiresIn } = result;
    if (AccessToken === undefined || IdToken === undefined || RefreshToken === undefined) {
      return err({ kind: "unavailable", reason: "tokens missing in authentication result" });
    }
    const verified = await verifyJwtWithSource(IdToken, this.jwks, {
      issuer: this.issuer,
      audience: this.config.clientId,
      clock: this.clock,
    });
    if (!verified.ok) {
      this.logger.error("cognito id token verification failed", { reason: verified.error.kind });
      return err({ kind: "unavailable", reason: "id token verification failed" });
    }
    const claims = verified.value;
    if (
      claims.token_use !== "id" ||
      typeof claims.sub !== "string" ||
      typeof claims.email !== "string"
    ) {
      return err({ kind: "unavailable", reason: "id token claims incomplete" });
    }
    return ok({
      sub: claims.sub,
      email: claims.email,
      ...(typeof claims.name === "string" && { name: claims.name }),
      tokens: {
        accessToken: AccessToken,
        idToken: IdToken,
        refreshToken: RefreshToken,
        expiresAt: this.clock.nowSeconds() + (ExpiresIn ?? 3600),
      },
    });
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/**
 * Cognito の例外を理由コードへ写像する。認証失敗系はユーザー列挙を防ぐため一つにまとめる。
 */
function mapCognitoError(error: unknown, logger: Logger): CognitoAuthError {
  switch (errorName(error)) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return { kind: "invalid_credentials" };
    case "UserNotConfirmedException":
      return { kind: "user_not_confirmed" };
    case "PasswordResetRequiredException":
      return { kind: "password_reset_required" };
    default:
      logger.error("cognito call failed", { name: errorName(error) });
      return { kind: "unavailable", reason: errorName(error) };
  }
}
