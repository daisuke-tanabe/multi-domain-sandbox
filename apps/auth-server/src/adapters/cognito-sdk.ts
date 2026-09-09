import { err, type Result } from "@sandbox/shared";
import type {
  CognitoAuthenticated,
  CognitoAuthenticator,
  CognitoAuthError,
  CognitoCredentials,
} from "../ports/cognito.ts";

/**
 * 本番向け Cognito アダプタの雛形。本サンドボックスでは実装しない。
 *
 * 実装時の方針。docs/design/00-current-state-and-decisions.md の D5 に対応する。
 *
 * 1. @aws-sdk/client-cognito-identity-provider の InitiateAuthCommand を AuthFlow=USER_SRP_AUTH で呼ぶ。
 *    SRP の計算は amazon-cognito-identity-js 相当の実装を用い、パスワードを平文で送らない。
 *    App Client に secret がある場合は SECRET_HASH を付ける。
 * 2. ChallengeName が返った場合は { kind: 'challenge_required' } を返す。MFA はフェーズ2。
 * 3. AuthenticationResult の IdToken を Cognito の JWKS で検証する。iss / aud / exp / token_use=id。
 * 4. 検証済み claims から sub / email / email_verified / name を取り出して返す。
 * 5. NotAuthorizedException と UserNotFoundException は共に invalid_credentials に写像する。
 * 6. UserNotConfirmedException → user_not_confirmed、PasswordResetRequiredException → password_reset_required。
 * 7. それ以外の例外は unavailable として返し、メッセージはログのみに残す。
 */
export class SdkCognitoAuthenticator implements CognitoAuthenticator {
  public async authenticate(
    _credentials: CognitoCredentials,
  ): Promise<Result<CognitoAuthenticated, CognitoAuthError>> {
    return err({
      kind: "unavailable",
      reason: "SdkCognitoAuthenticator is not implemented in this sandbox",
    });
  }

  public async revokeRefreshToken(
    _refreshToken: string,
  ): Promise<Result<void, { kind: "unavailable"; reason: string }>> {
    return err({
      kind: "unavailable",
      reason: "SdkCognitoAuthenticator is not implemented in this sandbox",
    });
  }
}
