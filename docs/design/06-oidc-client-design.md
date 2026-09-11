# OAuth/OIDC Client設計

## 結論

OIDC Client はサービスごとに1つの Confidential Client として登録する。サンドボックスでは `crm` と `cms`。判断事項D13。
テナントは Client に紐付けず、redirect_uri テンプレートと契約 tenant_services で紐付ける。
Client の登録は 1 件の oidc_clients、1 つの `redirect_uri_template`、1 つ以上の oidc_client_secrets、契約テナント分の tenant_services で構成する。判断事項D15。
client_secret_basic と PKCE を併用し、Client 実装は共通モジュール化する。
テナント追加は tenants と tenant_services の登録だけで完了し、redirect_uri の登録も Client 登録も Secret 配布も不要。

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

| client_id | 用途 | audience | redirect_uri_template | アクセス判定 |
| --- | --- | --- | --- | --- |
| `crm` | CRM の Tenant Web Application | https://api.crm.sandbox.com | `https://{tenant}.crm.sandbox.com/auth/callback` | user → tenant → 契約 → Membership |
| `cms` | CMS の Tenant Web Application | https://api.cms.sandbox.com | `https://{tenant}.cms.sandbox.com/auth/callback` | 同上 |
| `admin-console` | 管理画面。フェーズ2 | 管理 API の origin | 管理画面のホストを含むテンプレート | 管理用 scope で判定。設計はフェーズ2で決める |

Client 1 件は次の行で構成する。

| 表 | 行数 | 内容 |
| --- | --- | --- |
| oidc_clients | 1 | `id` はサロゲート主キー。`client_id` は UNIQUE の公開識別子。`redirect_uri_template` `audience` `backchannel_logout_uri` |
| oidc_client_secrets | 1 以上 | active な client_secret のハッシュ。ローテーション中は 2 行 |
| tenant_services | 契約テナント数 | `(tenant_id, oidc_client_id)`。外部キーは `oidc_clients.id` |

### テナントとサービスの解決

認可リクエストは `client_id` と `redirect_uri` の2つだけでサービスとテナントを決める。

```text
client_id    = crm
redirect_uri = https://suzuki.crm.sandbox.com/auth/callback
template     = https://{tenant}.crm.sandbox.com/auth/callback
→ 前方一致 "https://"、後方一致 ".crm.sandbox.com/auth/callback"、中間 "suzuki" が slug 形式
→ tenants を slug=suzuki で検索 → tenant_id
```

Tenant Web Application がクエリやヘッダでテナントを申告することはない。テンプレートを slug で展開した文字列が redirect_uri と完全一致することを要求するため、テナントの解決は redirect_uri 検証と同じ処理に吸収される。実装は `packages/shared/src/redirect-template.ts` の `matchRedirectUriTemplate`。

### テナント作成時の登録

```text
1. tenants に slug を挿入
2. 契約するサービスごとに tenant_services に (tenant_id, oidc_client_id) を挿入
```

redirect_uri はサービスのテンプレートから導くため、テナントごとの登録はない。Client と client_secret もサービスのものをそのまま使う。Tenant Web Application の設定変更は不要。

### サービス作成時の登録

```text
1. client_secret を生成。32 バイト以上の乱数
2. oidc_clients に id、client_id、name、audience、redirect_uri_template、backchannel_logout_uri を挿入
3. oidc_client_secrets に (oidc_client_id, sha256$<hash>, active) を挿入
4. 契約テナントごとに tenant_services を挿入
5. client_secret を Secret Store に `oidc/clients/<client_id>` として保存
6. そのサービスの web と api のプロセスを追加し、web に CLIENT_ID / CLIENT_SECRET / BASE_HOST / API_BASE_URL、api に API_BASE_URL を与える
```

サンドボックスでは provision が `SERVICES` の JSON から 1〜4 を投入する。`redirect_uri_template` は `SERVICES[].baseHost` から `<PUBLIC_SCHEME>://{tenant}.<baseHost>/auth/callback` として組み立て、サービスごとに active な secret を 1 行 upsert し、それ以外の active な secret は revoked にする。

### client_secret のローテーション

```text
1. 新しい client_secret を生成し、oidc_client_secrets に active で挿入
2. サービスの CLIENT_SECRET を新しい値に差し替えて再デプロイ
3. 旧行を revoked にし、revoked_at を記録
```

手順 1 と 3 の間は新旧どちらの secret でも `/token` と `/revoke` が通るため、サービスを止めずに切り替えられる。

## redirect_uri 検証規則

1. 認可リクエストの `redirect_uri` を `client_id` の `redirect_uri_template` に当てる。テンプレートの `{tenant}` より前と後ろが文字列完全一致し、中間が slug の形式 `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$` であることを要求する
2. 取り出した slug で tenants を検索する。行がなければ不一致として扱う
3. 不一致の場合、そのURIへリダイレクトせず Auth Server 上でエラー画面を表示する。`invalid_redirect_uri`
4. 見つかったテナントを認可リクエストのテナントとする。契約や Membership の判定はこのテナントに対して行う
5. `/token` でも code に紐付けた `redirect_uri` と再度完全一致検証する
6. 比較前の正規化は行わない。テンプレートを slug で展開した文字列と redirect_uri が 1 バイトでも違えば不一致。末尾スラッシュ、クエリ、大文字、多段ラベルはすべて拒否する
7. ローカル開発用の `http://{tenant}.crm.localhost:3001/auth/callback` 等は開発環境の Registry にのみ登録し、本番 Registry には https 以外を登録できないよう制約する

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
  1. pre-auth Cookie の参照 ID で pre-auth を getAndDelete し、Cookie も削除する。なければ 400
  2. state 一致検証。不一致なら 400 で code を破棄。iss があれば issuer と一致すること
  3. error パラメータがあればエラー画面を表示
     access_denied は error_description の理由に応じて 403
  4. /token へ Back Channel で交換。client認証 + code_verifier
  5. id_token 検証。署名 / iss / aud / exp / nonce / iat / tenant_slug == tenantSlug
  6. Tenant Session を新規 ID で作成。ストア <clientId>:sess にキー <tenantSlug>:<id> で保存
  7. return_to へ 302

POST /auth/logout
  1. CSRF 検証
  2. /revoke で refresh_token を失効
  3. Tenant Session 削除

POST /auth/backchannel-logout
  1. logout_token 検証。aud が自サービスの clientId と一致すること
  2. ストア <clientId>:sid のキー sid:<sid> の逆引きから、テナントを問わずそのサービスの全セッションを削除

内部ヘルパー
  getAccessToken(session)
    残り寿命が60秒未満なら /token refresh_token grant で更新
    invalid_grant ならセッション破棄し再ログインへ
  apiFetch(session, path, init)
    Authorization: Bearer を付与してサービスの apiBaseUrl を呼ぶ
```

実装は `packages/oidc-client` に置き、次の構成にする。

- `backchannelRoutes(deps, provider)` は `tenantContext` ミドルウェアより前に mount する。Back-Channel Logout はサーバー間通信で Host がテナントのホストにならないため、ミドルウェア側にパスの特別扱いを持たせない
- `oidcRoutes(deps, provider, renderError)` は `tenantContext` の後に mount し、Client を `c.get("tenantClient")` から受け取る
- Cookie の読み書きは `cookies.ts` にまとめる。セッション Cookie と pre-auth Cookie の読み取り、書き込み、削除
- ストアは `startServiceWeb` がサービスごとに `<clientId>:sess` `<clientId>:sid` `<clientId>:pre` のプレフィックスで作る。1 プロセス 1 サービスのため、ストア内のキーは `<tenantSlug>:<sessionId>`、`sid:<sid>`、`<tenantSlug>:<preAuthId>` とし clientId を含めない
- `PreAuthState` は state / nonce / codeVerifier / returnTo の 4 項目。id と作成時刻は持たず、寿命はストアの TTL で管理する
- `TenantSession.tenantId` は常に文字列。null にならない

設定として与えるのは自サービスの以下のみ。web プロセスは 1 サービスを担当し、環境変数 `CLIENT_ID` `CLIENT_SECRET` `SERVICE_NAME` `BASE_HOST` `API_BASE_URL` で渡す。スキーマは `packages/service-web/src/config.ts` の `loadServiceWebConfig`。

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
- JWKS は Discovery の `jwks_uri` から `packages/shared/src/jwks.ts` の `RemoteJwksSource` で取得する。10 分キャッシュし、未知の kid なら 1 回だけ再取得する。再取得は 60 秒に 1 回までに制限し、同時要求は 1 回の取得にまとめ、取得失敗時はキャッシュを使う
- ID Token と logout_token の検証は同じ `RemoteJwksSource` を共有し、鍵ローテーション時の挙動を揃える。API Server の Access Token 検証も同じ実装を使う
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
| 管理画面 | 管理画面用の Client を追加し `admin` scope を付与。audience は管理 API の origin。テナントに紐付かない戻り先の扱いはフェーズ2で決める |
| 外部 API 利用者 | Client Credentials grant を追加。同じ Registry で管理。secret は oidc_client_secrets をそのまま使う |
| private_key_jwt | oidc_clients に jwks を持たせる列を追加 |
| 外部 IdP 連携 | Cognito の Identity Provider 設定で対応。Auth Server の Client 側は変更なし |
| サービスの別ドメイン化 | baseHost を `crm.com` のように変えるだけ。SSO は auth.sandbox.com の SSO Session で成立し Cookie の Domain に依存しない |
