import {
  err,
  generateTotpSecret,
  ok,
  randomToken,
  timingSafeEqualString,
  verifyTotp,
  type Clock,
  type Result,
} from "@sandbox/shared";
import type {
  CognitoAuthenticated,
  CognitoAuthenticator,
  CognitoAuthError,
  CognitoAuthOutcome,
  CognitoCredentials,
  CognitoMfaError,
  MockCognitoUser,
} from "../application/ports/cognito.ts";

const MOCK_TOKEN_LIFETIME_SECONDS = 60 * 60;
const MOCK_SESSION_LIFETIME_SECONDS = 3 * 60;

/**
 * ローカル検証用の Cognito モック。設定されたユーザーとパスワードを照合し、ダミーの Token を返す。
 * TOTP は本物の RFC 6238 で検証する。登録状態はプロセスのメモリに持ち、再起動で消える。
 * 本番アダプタと同じ CognitoAuthenticator を実装するため、上位層はモックと本番を区別しない。
 */
export class MockCognitoAuthenticator implements CognitoAuthenticator {
  /** 登録済みの secret。設定の totpSecret と、実行中に登録したもの */
  private readonly enrolled = new Map<string, string>();
  /** 登録中の secret。verifySoftwareToken で確定するまで有効にしない */
  private readonly pendingSecrets = new Map<string, string>();
  private readonly verifiedSecrets = new Map<string, string>();
  private readonly accessTokens = new Map<string, string>();
  private readonly sessions = new Map<string, { username: string; expiresAt: number }>();

  constructor(
    private readonly users: ReadonlyArray<MockCognitoUser>,
    private readonly clock: Clock,
  ) {
    for (const user of users) {
      if (user.totpSecret !== undefined) this.enrolled.set(user.username, user.totpSecret);
    }
  }

  public async authenticate(
    credentials: CognitoCredentials,
  ): Promise<Result<CognitoAuthOutcome, CognitoAuthError>> {
    const user = this.users.find((candidate) => candidate.username === credentials.username);
    // ユーザー不在でもパスワード比較を行い、応答時間の差でユーザー列挙されないようにする
    const expectedPassword = user?.password ?? randomToken();
    const passwordMatches = timingSafeEqualString(credentials.password, expectedPassword);
    if (user === undefined || !passwordMatches) return err({ kind: "invalid_credentials" });

    if (this.enrolled.has(user.username)) {
      const session = randomToken();
      this.sessions.set(session, {
        username: user.username,
        expiresAt: this.clock.nowSeconds() + MOCK_SESSION_LIFETIME_SECONDS,
      });
      return ok({ kind: "totp_required", session, username: user.username });
    }
    return ok({ kind: "authenticated", authenticated: this.issue(user) });
  }

  public async respondToTotp(input: {
    readonly username: string;
    readonly session: string;
    readonly code: string;
  }): Promise<Result<CognitoAuthenticated, CognitoMfaError>> {
    const session = this.sessions.get(input.session);
    if (
      session === undefined ||
      session.username !== input.username ||
      session.expiresAt < this.clock.nowSeconds()
    ) {
      return err({ kind: "session_expired" });
    }
    const secret = this.enrolled.get(input.username);
    const user = this.users.find((candidate) => candidate.username === input.username);
    if (secret === undefined || user === undefined) return err({ kind: "session_expired" });
    if (!verifyTotp(secret, input.code, this.clock.nowSeconds())) {
      return err({ kind: "code_mismatch" });
    }
    this.sessions.delete(input.session);
    return ok(this.issue(user));
  }

  public async associateSoftwareToken(
    accessToken: string,
  ): Promise<Result<{ secret: string }, CognitoMfaError>> {
    const username = this.accessTokens.get(accessToken);
    if (username === undefined) return err({ kind: "session_expired" });
    const secret = generateTotpSecret();
    this.pendingSecrets.set(username, secret);
    return ok({ secret });
  }

  public async verifySoftwareToken(
    accessToken: string,
    code: string,
  ): Promise<Result<void, CognitoMfaError>> {
    const username = this.accessTokens.get(accessToken);
    const secret = username === undefined ? undefined : this.pendingSecrets.get(username);
    if (username === undefined || secret === undefined) return err({ kind: "session_expired" });
    if (!verifyTotp(secret, code, this.clock.nowSeconds())) return err({ kind: "code_mismatch" });
    this.verifiedSecrets.set(username, secret);
    return ok(undefined);
  }

  public async enableTotp(accessToken: string): Promise<Result<void, CognitoMfaError>> {
    const username = this.accessTokens.get(accessToken);
    const secret = username === undefined ? undefined : this.verifiedSecrets.get(username);
    if (username === undefined || secret === undefined) return err({ kind: "session_expired" });
    this.enrolled.set(username, secret);
    this.pendingSecrets.delete(username);
    this.verifiedSecrets.delete(username);
    return ok(undefined);
  }

  public async revokeRefreshToken(): Promise<
    Result<void, { kind: "unavailable"; reason: string }>
  > {
    return ok(undefined);
  }

  /** テストの検証用。登録済みの secret */
  public enrolledSecret(username: string): string | undefined {
    return this.enrolled.get(username);
  }

  private issue(user: MockCognitoUser): CognitoAuthenticated {
    const issuedAt = this.clock.nowSeconds();
    const accessToken = `mock-access-${randomToken(8)}`;
    this.accessTokens.set(accessToken, user.username);
    return {
      sub: user.sub,
      email: user.email,
      ...(user.name !== undefined && { name: user.name }),
      tokens: {
        accessToken,
        idToken: `mock-id-${randomToken(8)}`,
        refreshToken: `mock-refresh-${randomToken(8)}`,
        expiresAt: issuedAt + MOCK_TOKEN_LIFETIME_SECONDS,
      },
    };
  }
}
