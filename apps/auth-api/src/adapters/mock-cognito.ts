import { timingSafeEqual } from "node:crypto";
import { err, ok, randomToken, type Clock, type Result } from "@sandbox/shared";
import type { MockCognitoUser } from "../config.ts";
import type {
  CognitoAuthenticated,
  CognitoAuthenticator,
  CognitoAuthError,
  CognitoCredentials,
} from "../ports/cognito.ts";

const MOCK_TOKEN_LIFETIME_SECONDS = 60 * 60;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * ローカル検証用の Cognito モック。設定されたユーザーとパスワードを照合し、ダミーの Token を返す。
 * 本番アダプタと同じ CognitoAuthenticator を実装するため、上位層はモックと本番を区別しない。
 */
export class MockCognitoAuthenticator implements CognitoAuthenticator {
  constructor(
    private readonly users: ReadonlyArray<MockCognitoUser>,
    private readonly clock: Clock,
  ) {}

  public async authenticate(
    credentials: CognitoCredentials,
  ): Promise<Result<CognitoAuthenticated, CognitoAuthError>> {
    const user = this.users.find((candidate) => candidate.username === credentials.username);
    // ユーザー不在でもパスワード比較を行い、応答時間の差でユーザー列挙されないようにする
    const expectedPassword = user?.password ?? randomToken();
    const passwordMatches = safeEqual(credentials.password, expectedPassword);
    if (user === undefined || !passwordMatches) return err({ kind: "invalid_credentials" });

    const issuedAt = this.clock.nowSeconds();
    return ok({
      sub: user.sub,
      email: user.email,
      emailVerified: true,
      ...(user.name !== undefined && { name: user.name }),
      tokens: {
        accessToken: `mock-access-${randomToken(8)}`,
        idToken: `mock-id-${randomToken(8)}`,
        refreshToken: `mock-refresh-${randomToken(8)}`,
        expiresAt: issuedAt + MOCK_TOKEN_LIFETIME_SECONDS,
      },
    });
  }

  public async revokeRefreshToken(): Promise<
    Result<void, { kind: "unavailable"; reason: string }>
  > {
    return ok(undefined);
  }
}
