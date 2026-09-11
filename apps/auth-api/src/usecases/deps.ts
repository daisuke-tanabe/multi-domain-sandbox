import type { Clock, EncryptionKey, Logger, SigningKey } from "@sandbox/shared";
import type { CognitoAuthenticator } from "../ports/cognito.ts";
import type { IdentityRepository } from "../ports/identity-repository.ts";
import type { AuthStores } from "../ports/stores.ts";

/**
 * ユースケースが依存するもの。main.ts とテストで組み立てる。
 */
export interface AuthDeps {
  readonly issuer: string;
  readonly clock: Clock;
  readonly stores: AuthStores;
  readonly identity: IdentityRepository;
  readonly cognito: CognitoAuthenticator;
  readonly signingKey: SigningKey;
  /** 先頭が現行鍵。残りは復号のみに使う旧鍵 */
  readonly encryptionKeys: ReadonlyArray<EncryptionKey>;
  readonly logger: Logger;
  /** Back-Channel Logout の送信に使う。テストで差し替える */
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
}
