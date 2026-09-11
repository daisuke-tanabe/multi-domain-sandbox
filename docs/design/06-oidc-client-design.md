# OAuth/OIDC Client設計

## 結論

OIDC Client はサービスごとに1つの Confidential Client として登録する。サンドボックスでは `crm` と `cms`。判断事項D13。
テナントは Client に紐付けず、redirect_uri の登録と契約 tenant_services で紐付ける。
client_secret_basic と PKCE を併用し、Client 実装は共通モジュール化する。
テナント追加は tenants、tenant_services、redirect_uri の登録だけで完了し、Client 登録も Secret 配布も不要。

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

| client_id | 用途 | audience | redirect_uri の tenant_id | アクセス判定 |
| --- | --- | --- | --- | --- |
| `crm` | CRM の Tenant Web Application | https://api.crm.sandbox.com | テナントごとに登録 | user → tenant → 契約 → Membership |
| `cms` | CMS の Tenant Web Application | https://api.cms.sandbox.com | テナントごとに登録 | 同上 |
| `admin-console` | 管理画面。フェーズ2 | 管理 API の origin | NULL | users.status のみ。管理用 scope で判定 |

### テナントとサービスの解決

認可リクエストは `client_id` と `redirect_uri` の2つだけでサービスとテナントを決める。

```text
client_id    = crm
redirect_uri = https://suzuki.crm.sandbox.com/auth/callback
→ oidc_client_redirect_uris (crm, https://suzuki.crm.sandbox.com/auth/callback) の tenant_id = suzuki
```

Tenant Web Application がクエリやヘッダでテナントを申告することはない。redirect_uri は登録値との完全一致で検証するため、テナントの解決は redirect_uri 検証と同じ処理に吸収される。

### テナント作成時の登録

```text
1. tenants に slug を挿入
2. 契約するサービスごとに tenant_services に (tenant_id, client_id) を挿入
3. 契約するサービスごとに oidc_client_redirect_uris に
   (client_id, https://<slug>.<service>.sandbox.com/auth/callback, tenant_id) を挿入
```

Client と client_secret はサービスのものをそのまま使う。Tenant Web Application の設定変更は不要。

### サービス作成時の登録

```text
1. client_secret を生成。256bit random
2. oidc_clients に client_id、client_secret_hash、name、audience、backchannel_logout_uri を挿入
3. 契約テナントごとに tenant_services と redirect_uri を挿入
4. client_secret を Secret Store に `oidc/clients/<client_id>` として保存
5. そのサービスの web と api のプロセスを追加し、CLIENT_ID / CLIENT_SECRET / BASE_HOST / API_BASE_URL と API_HOST を与える
```

サンドボックスでは provision が `SERVICES` の JSON から 1〜3 を投入する。

## redirect_uri 検証規則

1. 認可リクエストの `redirect_uri` は `(client_id, redirect_uri)` の登録値と文字列完全一致で比較する
2. 不一致の場合、そのURIへリダイレクトせず Auth Server 上でエラー画面を表示する
3. 一致した行の `tenant_id` を認可リクエストのテナントとする。契約や Membership の判定はこのテナントに対して行う
4. `/token` でも code に紐付けた `redirect_uri` と再度完全一致検証する
5. 比較前の正規化は行わない
6. ローカル開発用の `http://tanaka.crm.localhost:3001/auth/callback` 等は開発環境の Registry にのみ登録し、本番 Registry には https 以外を登録できないよう制約する

## 共通クライアントモジュールの責務

```text
Host の解決
  1. Host が自サービスの baseHost で終わることを確認。該当なしは 404
  2. baseHost の前のラベルを tenantSlug とする。tanaka.crm.sandbox.com → service=crm, tenantSlug=tanaka
  3. redirect_uri = <scheme>://<host>/auth/callback

GET /auth/login?return_to=/projects
  1. Host から tenantSlug を解決する
  2. return_to を検証。自ドメイン内の絶対パスのみ許可
  3. state, nonce, code_verifier を生成
  4. pre-auth を保存し参照IDを Cookie に設定
  5. /authorize へ 302。client_id はサービス、redirect_uri は Host から組み立てた値

GET /auth/callback
  1. pre-auth Cookie から pre-auth を取得。なければ 400
  2. error パラメータがあれば state を検証してからエラー画面を表示
     access_denied は error_description の理由に応じて 403
  3. state 一致検証。不一致なら 400 で code を破棄
  4. /token へ Back Channel で交換。client認証 + code_verifier
  5. id_token 検証。署名 / iss / aud / exp / nonce / iat / tenant_slug == tenantSlug
  6. Tenant Session を新規 ID で作成。キーは <clientId>:<tenantSlug>:<id>
  7. pre-auth を削除し return_to へ 302

POST /auth/logout
  1. CSRF 検証
  2. /revoke で refresh_token を失効
  3. Tenant Session 削除

POST /auth/backchannel-logout
  1. logout_token 検証。aud が自サービスの clientId と一致すること
  2. <clientId>:sid:<sid> の逆引きから、テナントを問わずそのサービスの全セッションを削除

内部ヘルパー
  getAccessToken(session)
    残り寿命が60秒未満なら /token refresh_token grant で更新
    invalid_grant ならセッション破棄し再ログインへ
  apiFetch(session, path, init)
    Authorization: Bearer を付与してサービスの apiBaseUrl を呼ぶ
```

設定として与えるのは自サービスの以下のみ。web プロセスは 1 サービスを担当し、環境変数 `CLIENT_ID` `CLIENT_SECRET` `SERVICE_NAME` `BASE_HOST` `API_BASE_URL` で渡す。

```typescript
type ServiceConfig = {
  clientId: string;           // CLIENT_ID。crm
  clientSecret: string;       // CLIENT_SECRET。Secret Store から注入。ローカルは crm-secret
  name: string;               // SERVICE_NAME。CRM。エラー画面やポータルの表示名
  baseHost: string;           // BASE_HOST。crm.sandbox.com。前にテナント slug が付く
  apiBaseUrl: string;         // API_BASE_URL。https://api.crm.sandbox.com
};

type OidcClientConfig = ServiceConfig & {
  issuer: string;             // https://auth.sandbox.com
  tenantSlug: string;         // Host から解決
  redirectUri: string;        // <scheme>://<host>/auth/callback
  scopes: string[];
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
- `redirect_uri` に戻り先を含めない。redirect_uri は Host から決まる固定値

## Third-Party Initiated Login

auth.sandbox.com のポータルは、所属テナントごとに契約サービスの `https://<tenant>.<service>.sandbox.com/auth/login` へのリンクを並べる。リンク先は通常の `/auth/login` なので、Tenant Web Application 側に専用の入口は不要。

## 将来拡張との対応

| 拡張 | 対応 |
| --- | --- |
| 管理画面 | tenant_id なしの redirect_uri を持つ Client を追加し `admin` scope を付与。audience は管理 API の origin |
| 外部 API 利用者 | Client Credentials grant を追加。同じ Registry で管理 |
| private_key_jwt | oidc_clients に jwks を持たせる列を追加 |
| 外部 IdP 連携 | Cognito の Identity Provider 設定で対応。Auth Server の Client 側は変更なし |
| サービスの別ドメイン化 | baseHost を `crm.com` のように変えるだけ。SSO は auth.sandbox.com の SSO Session で成立し Cookie の Domain に依存しない |
