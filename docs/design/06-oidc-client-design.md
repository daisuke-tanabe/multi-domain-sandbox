# OAuth/OIDC Client設計

## 結論

Tenant Web Application はテナントごとに1つの Confidential Client として登録する。
client_secret_basic と PKCE を併用し、Client 実装は共通モジュール化する。
テナント追加は Client Registry への自動登録のみで完了し、既存テナントの変更は不要。

## Clientの分類

| 項目 | 採用 | 理由 |
| --- | --- | --- |
| 種別 | Confidential Client | BFF がサーバー側で code 交換するため secret を安全に保持できる |
| フロー | Authorization Code + PKCE | 仕様書11章。Implicit / Hybrid は無効化 |
| クライアント認証 | client_secret_basic | 標準で十分。将来 private_key_jwt へ移行可能 |
| response_type | code のみ | |
| scope | openid 必須。profile / email 任意 | claims を最小限にする |
| grant_type | authorization_code / refresh_token | |

## Client の登録単位

判断事項D2に従いテナントごとに1 Client。

| client_id | 用途 | tenant_id | Membership判定 |
| --- | --- | --- | --- |
| `<slug>` | Tenant Web Application | あり | `/authorize` で必須 |
| `another-service` | 別ドメインのサービス | なし | スキップ。Access Token に tenant_id なし |
| `admin-console` | 管理画面。フェーズ2 | なし | 管理用 scope で判定 |

### テナント作成時の自動登録

```text
1. tenants に slug を挿入
2. client_secret を生成。256bit random
3. oidc_clients に client_id=slug、client_secret_hash、tenant_id を挿入
4. oidc_client_redirect_uris に https://<slug>.sandbox.com/auth/callback を挿入
5. client_secret を Secret Store に `oidc/clients/<slug>` として保存
```

Tenant Web Application はリクエストの Host から slug を解決し、Secret Store から `oidc/clients/<slug>` を読む。プロセス内でキャッシュしてよい。

## redirect_uri 検証規則

1. 認可リクエストの `redirect_uri` は登録値と文字列完全一致で比較する
2. 不一致の場合、そのURIへリダイレクトせず Auth Server 上でエラー画面を表示する
3. `/token` でも code に紐付けた `redirect_uri` と再度完全一致検証する
4. 比較前の正規化は行わない
5. ローカル開発用の `http://tenant-a.localhost:3001/auth/callback` 等は開発環境の Registry にのみ登録し、本番 Registry には https 以外を登録できないよう制約する

## 共通クライアントモジュールの責務

```text
GET /auth/login?return_to=/projects
  1. Host から slug を解決し client 設定を読む
  2. return_to を検証。自ドメイン内の絶対パスのみ許可
  3. state, nonce, code_verifier を生成
  4. pre-auth を保存し参照IDを Cookie に設定
  5. /authorize へ 302

GET /auth/callback
  1. pre-auth Cookie から pre-auth を取得。なければ 400
  2. error パラメータがあれば state を検証してからエラー画面を表示
  3. state 一致検証。不一致なら 400 で code を破棄
  4. /token へ Back Channel で交換。client認証 + code_verifier
  5. id_token 検証。署名 / iss / aud / exp / nonce / iat
  6. Tenant Session を新規 ID で作成。access_token / refresh_token を保存
  7. pre-auth を削除し return_to へ 302

POST /auth/logout
  1. CSRF 検証
  2. /revoke で refresh_token を失効
  3. Tenant Session 削除

内部ヘルパー
  getAccessToken(session)
    残り寿命が60秒未満なら /token refresh_token grant で更新
    invalid_grant ならセッション破棄し再ログインへ
  apiFetch(session, path, init)
    Authorization: Bearer を付与して api.sandbox.com を呼ぶ
```

設定として与えるのは以下のみ。

```typescript
type OidcClientConfig = {
  issuer: string;             // https://auth.sandbox.com
  clientId: string;           // slug
  clientSecret: string;       // Secret Store から注入
  redirectUri: string;        // https://<slug>.sandbox.com/auth/callback
  scopes: string[];
  apiBaseUrl: string;         // https://api.sandbox.com
  sessionCookieName: string;  // __Host-tenant_session
};
```

## Discovery と鍵取得

- 起動時に `/.well-known/openid-configuration` を取得し endpoint を解決する
- `/jwks` は kid 単位でキャッシュ。未知の kid は再取得。再取得は1分に1回までに制限する
- 取得失敗時は起動を失敗させる。古い鍵で動き続けない

## return_to の扱い

- pre-auth に保存するのは自ドメイン内の絶対パスのみ。`/` で始まり `//` で始まらない
- 絶対URL、`javascript:`、`\` を含む値は拒否し `/` へフォールバック
- `redirect_uri` に戻り先を含めない。redirect_uri は固定値

## 別ドメインサービスの追加手順

1. client_id / client_secret を発行し oidc_clients に登録。tenant_id は NULL
2. redirect_uri を登録
3. サービスへ共通クライアントモジュールを導入
4. サービス側に users.id を external_user_id として保存する列を用意する

既存テナントや Auth Server のコード変更は発生しない。

## 将来拡張との対応

| 拡張 | 対応 |
| --- | --- |
| 管理画面 | tenant_id なし Client を追加し `admin` scope を付与。Access Token の aud は api.sandbox.com のまま |
| 外部 API 利用者 | Client Credentials grant を追加。Tenant Web Application と同じ Registry で管理 |
| private_key_jwt | oidc_clients に jwks を持たせる列を追加 |
| 外部 IdP 連携 | Cognito の Identity Provider 設定で対応。Auth Server の Client 側は変更なし |
