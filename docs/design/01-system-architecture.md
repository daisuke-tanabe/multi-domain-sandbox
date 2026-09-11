# システム構成図

## 結論

auth.sandbox.com を独立した OpenID Provider として構築し、Cognito はその内部の認証バックエンドに限定する。
OIDC Client はサービス単位で登録する。サンドボックスのサービスは CRM と CMS の2つで、client_id はそれぞれ `crm` と `cms`。
テナントは顧客企業であり、サービス横断で共有する。サンドボックスのテナントは `tanaka` と `suzuki` で、tanaka は CRM と CMS を、suzuki は CRM のみを契約している。
Tenant Web Application は `<tenant>.<service>.sandbox.com` の Host でサービスとテナントを解決する BFF であり、サーバー側セッションを持つ。
API Server は Resource Server であり、Host から導いた aud で Token を検証し、役割と権限は自サービスの DB だけから読む。Identity DB には接続しない。招待はサービスの画面から行い、役割の語彙はサービスごとに違う。Token には役割も権限も載せない。判断事項D16、D17。
DB はサービスごとに分かれる。Identity DB は Auth Server だけが、CRM DB は crm-api だけが、CMS DB は cms-api だけが接続し、DB 間の外部キーや JOIN はない。

## 全体構成

```mermaid
flowchart TB
    User((ブラウザ))

    subgraph AWS
        Cognito["Amazon Cognito User Pool<br/>パスワード検証 / MFA / ユーザー管理"]
    end

    subgraph AuthLayer ["auth.sandbox.com  OpenID Provider"]
        Auth["Auth Server<br/>/ /authorize /login /token /jwks /userinfo /logout<br/>/admin/service-members"]
        SsoStore[("SSO Session Store<br/>Auth Code Store<br/>Refresh Token Store")]
        Keys[("署名鍵 JWKS")]
        Auth --- SsoStore
        Auth --- Keys
    end

    subgraph Identity ["Identity DB  接続: Auth Server のみ"]
        IdDB[("users<br/>tenants<br/>tenant_members<br/>oidc_clients<br/>oidc_client_secrets<br/>tenant_services<br/>tenant_service_members")]
    end

    subgraph Crm ["CRM  OIDC Client: crm"]
        WebCrm["Tenant Web App (BFF)<br/>tanaka.crm.sandbox.com<br/>suzuki.crm.sandbox.com"]
        ApiCrm["API Server<br/>api.crm.sandbox.com"]
        CrmDB[("CRM DB<br/>members / permission_overrides<br/>end_users<br/>tenant_idで分離")]
    end

    subgraph Cms ["CMS  OIDC Client: cms"]
        WebCms["Tenant Web App (BFF)<br/>tanaka.cms.sandbox.com"]
        ApiCms["API Server<br/>api.cms.sandbox.com"]
        CmsDB[("CMS DB<br/>members / permission_overrides<br/>posts<br/>tenant_idで分離")]
    end

    Sess[("Tenant Session Store<br/>ストア clientId:sess<br/>キー tenantSlug:sessionId")]

    User -- "tenant_session Cookie<br/>ホストごとに別" --> WebCrm
    User -- "tenant_session Cookie<br/>ホストごとに別" --> WebCms
    User -- "sso_session Cookie<br/>認可リクエスト / ログインUI / ポータル" --> Auth
    Auth -- "InitiateAuth 等" --> Cognito
    Auth -- "読み書き" --> IdDB
    WebCrm -- "Back Channel<br/>/token /userinfo" --> Auth
    WebCms -- "Back Channel<br/>/token /userinfo" --> Auth
    WebCrm --- Sess
    WebCms --- Sess
    WebCrm -- "Bearer Access Token<br/>aud=api.crm" --> ApiCrm
    WebCms -- "Bearer Access Token<br/>aud=api.cms" --> ApiCms
    ApiCrm --- CrmDB
    ApiCms --- CmsDB
    ApiCrm -- "JWKS取得<br/>管理 API で招待 / 解除" --> Auth
    ApiCms -- "JWKS取得<br/>管理 API で招待 / 解除" --> Auth
```

サンドボックスではサービスごとに Tenant Web Application と API Server を 1 プロセスずつ持つ。crm-web / crm-api / cms-web / cms-api の 4 プロセスで、各 web は自サービスの全テナントの Host を受ける。web の実装は `packages/web-core` で共有し、crm-web / cms-web の `main.ts` は `startWebCore` を呼ぶだけ。api は `packages/api-core` をフレームワークとして使い、crm-api / cms-api は `definition.ts` で役割と権限を宣言し、サービス固有の routes と repository を持って `startApiCore` に渡す。環境変数のスキーマは `packages/web-core/src/config.ts` と `packages/api-core/src/config.ts` にある。サービスを別ドメインに分けても構成は変わらない。判断事項D14。
DB もサービスごとに分かれる。ローカルは docker compose の `db-identity` 5432、`db-crm` 5433、`db-cms` 5434 の 3 コンテナで、初期化 SQL は `db/identity/init` `db/crm/init` `db/cms/init`。判断事項D17。

## サービスとテナント

| 概念 | 実体 | サンドボックスの値 |
| --- | --- | --- |
| サービス | Auth Server を使うプロダクト。OIDC Client と1対1 | `crm` CRM、`cms` CMS |
| テナント | 顧客企業。サービス横断で共有する | `tanaka` Tanaka Inc.、`suzuki` Suzuki Ltd. |
| 契約 | テナントがサービスを利用できるか。tenant_services | tanaka→crm、tanaka→cms、suzuki→crm。suzuki は cms を契約していない |
| 割り当て | ユーザーがテナント × サービスに入れるか。identity の tenant_service_members。招待はこの単位。役割は持たない | alice は tanaka の crm と cms、suzuki の crm に入れる。bob は suzuki の crm に入れる。carol は割り当てなし |
| 会社横断の役割 | 管理者や請求担当のような、サービスに依らない立場。tenant_members。ログイン可否には使わない | alice は tanaka の owner、bob は suzuki の owner |
| サービスでの役割 | そのサービスでの役割。サービス側 DB の members。語彙はサービスごとに `ServiceDefinition` で宣言する | CRM は owner / admin / member / viewer。alice は tanaka で owner、suzuki で viewer、bob は suzuki で admin。CMS は owner / editor / viewer。alice は tanaka で owner |
| 権限の上書き | 役割の既定に対する個別の allow / deny。サービス側 DB の permission_overrides。Token には載せない | alice は suzuki の crm で end_users:unmask を allow、tanaka の cms で posts:create を deny |
| 業務データ | サービス側 DB の表。すべて tenant_id を持ち RLS で分離する | CRM の end_users、CMS の posts |

## ホスト一覧

| 役割 | アプリ | 本番の形 | ローカル |
| --- | --- | --- | --- |
| Auth Server | auth-api | auth.sandbox.com | auth.localhost:3000 |
| CRM の Tenant Web Application | crm-web | `<tenant>.crm.sandbox.com`。tanaka.crm.sandbox.com、suzuki.crm.sandbox.com | tanaka.crm.localhost:3001、suzuki.crm.localhost:3001 |
| CRM の API Server | crm-api | api.crm.sandbox.com | api.crm.localhost:3002 |
| CMS の Tenant Web Application | cms-web | `<tenant>.cms.sandbox.com`。tanaka.cms.sandbox.com | tanaka.cms.localhost:3003、suzuki.cms.localhost:3003 |
| CMS の API Server | cms-api | api.cms.sandbox.com | api.cms.localhost:3004 |

サービスは独立したドメインに置いてもよい。tanaka.crm.com と tanaka.cms.com のようにドメインが異なっても、SSO は auth.sandbox.com の SSO Session で成立し Cookie の Domain に依存しない。
suzuki.cms.localhost:3003 は redirect_uri が cms のテンプレートに一致し suzuki も既知のテナントだが、契約がないため `/authorize` が `access_denied` を返す。

## レイヤーと責務

| レイヤー | ホスト | 責務 | 持つ状態 |
| --- | --- | --- | --- |
| 認証 | Cognito | パスワード検証、MFA、ユーザー管理、Cognito Token発行 | Cognitoユーザー |
| SSO / 認可 | auth.sandbox.com | OpenID Provider。SSOセッション、Client管理、契約とサービスへの割り当てによるアクセス可否判定、Token発行、ポータル、サービスからの招待の受け付け | SSO Session、Auth Code、Refresh Token、Identity DB、署名鍵 |
| アプリケーション | `<tenant>.<service>.sandbox.com` | UI、テナントセッション、OIDC Client、APIへのサーバー間呼び出し | Tenant Session、Access / Refresh Tokenのサーバー側保持 |
| API | `api.<service>.sandbox.com` | 業務API、Token検証、自サービスの役割と権限による認可、管理アカウントの招待と権限編集、Tenant Isolation | 自サービスの DB。members、permission_overrides、業務データ |

責務の混在を禁止する。

- Tenant Web Application は Cognito API を呼ばない。Cognito Token を受け取らない
- API Server はログインを扱わない。Token検証と認可のみ行い、Identity DB に接続しない
- Auth Server は業務データも役割も持たない。Identity DB は識別、契約、サービスへの割り当てのみ。役割と権限は各サービスの DB に置き、Auth Server は役割と権限の語彙を知らない
- ブラウザはいかなる Token も保持しない。Cookie のみ

## 通信経路の分類

| 経路 | 種別 | 通るもの | 保護 |
| --- | --- | --- | --- |
| ブラウザ → `<tenant>.<service>.sandbox.com` | Front Channel | 画面、tenant_session Cookie | TLS、Cookie属性、CSRFトークン |
| ブラウザ → auth.sandbox.com | Front Channel | 認可リクエスト、ログインUI、ポータル、sso_session Cookie、code、state | TLS、Cookie属性、CSRFトークン |
| Tenant Web App → auth.sandbox.com | Back Channel | code交換、Refresh、UserInfo | TLS、client_secret_basic、PKCE |
| Tenant Web App → `api.<service>.sandbox.com` | Back Channel | Bearer Access Token | TLS、JWT署名検証、aud検証 |
| auth.sandbox.com → Tenant Web App | Back Channel | Back-Channel Logout の logout_token | TLS、JWT署名検証 |
| auth.sandbox.com → Cognito | Back Channel | InitiateAuth 等 | TLS、App Client Secret |
| `api.<service>.sandbox.com` → auth.sandbox.com | Back Channel | 管理 API での招待と割り当て解除、JWKS | TLS、client_secret_basic |
| `api.<service>.sandbox.com` → 自サービスの DB | 内部 | members、permission_overrides、業務データ | NOBYPASSRLS のアプリロール、RLS |

Front Channel を通る認証関連の値は Authorization Code と state のみ。

## テナントコンテキストの流れ

Host からサービスとテナントを特定するが、認可の根拠には使わない。

```mermaid
flowchart LR
    Host["Host: suzuki.crm.sandbox.com"] --> Resolve["service = crm<br/>tenantSlug = suzuki<br/>CLIENT_ID と BASE_HOST で解決"]
    Resolve --> Req["/authorize<br/>client_id = crm<br/>redirect_uri = https://suzuki.crm.sandbox.com/auth/callback"]
    Req --> Tenant["redirect_uri を crm の<br/>redirect_uri_template に当てて slug を取り出し<br/>tenants から tenant_id を解決"]
    Tenant --> Check["user active → tenant active<br/>→ tenant_services → tenant_service_members"]
    Check --> Token["ID Token: tenant_slug<br/>Access Token: aud=api.crm, tenant_id, client_id<br/>role も permission も載せない"]
    Token --> Api["API Server<br/>Host が自 API のホストか確認し aud を検証<br/>自 DB の members から役割<br/>permission_overrides で権限を確定<br/>リソースのtenant_idと一致確認"]
```

- Host はテナント slug の解決と redirect_uri の組み立てにのみ使う。サービスはプロセスの環境変数で固定される
- 認可リクエストのテナントは Auth Server が client_id と redirect_uri の組から解決する。redirect_uri をサービスの `redirect_uri_template` に当てて slug を取り出し、tenants を slug で引く。テンプレートに一致しないか slug が未知なら `invalid_redirect_uri` でリダイレクトしない。Tenant Web Application が申告した値は使わない
- すべての認可はテナントに紐付く。ID Token と Access Token には必ず `tenant_id` と `tenant_slug` が載る
- テナントへのアクセス可否は Auth Server が `/authorize` と refresh_token grant で判定する。順序は user → tenant → 契約 → サービスへの割り当て
- Tenant Web Application は ID Token の `tenant_slug` が Host から得たテナントと一致することを検証する
- API Server は Host が `API_BASE_URL` のホストと一致することを確認し、`API_BASE_URL` を aud として Token と照合し、Token の `tenant_id` と `sub` で自サービス DB の members を読む。行がなければ既定の役割で作る。役割の既定に permission_overrides を重ねて permission を確定する。「入れるか」は Auth Server が Token 発行時と Refresh 時に判定済みで、API は Identity DB を見ない

## Auth Server エンドポイント一覧

| エンドポイント | メソッド | 用途 | 呼び出し元 |
| --- | --- | --- | --- |
| `/.well-known/openid-configuration` | GET | OIDC Discovery | Client、API Server |
| `/jwks` | GET | ID Token / Access Token検証用公開鍵 | Client、API Server |
| `/` | GET | ポータル。SSO Session があればテナントごとに割り当てのあるサービスの入口を表示。役割はサービスが持つため出さない。なければ `/login` へ | ブラウザ |
| `/authorize` | GET | 認可エンドポイント。redirect_uri をテンプレートに当ててテナント解決、SSOセッション判定、契約とサービスへの割り当て判定、code発行 | ブラウザ |
| `/login` | GET | ログインフォーム。rid なしはポータル用ログインで、成功後に `/` へ戻る | ブラウザ |
| `/login` | POST | Cognito InitiateAuth による認証 | ブラウザ |
| `/login/challenge` | POST | MFA等のチャレンジ応答。フェーズ2 | ブラウザ |
| `/token` | POST | code交換、refresh_token grant | Client。Back Channel |
| `/userinfo` | GET | claims提供 | Client。Back Channel |
| `/revoke` | POST | Refresh Token失効。RFC 7009 | Client。Back Channel |
| `/logout` | GET/POST | Global Logout。`client_id` と `tenant` を受け取り、確認画面を経て完了後に元のサービスへ戻るリンクを表示。リンクは `redirect_uri_template` を `tenant` で展開して導く | ブラウザ |
| `/admin/service-members` | GET | `tenant_id` を受け取り、そのテナントで呼び出し元のサービスに入れる人の一覧を返す。client_secret_basic | サービスの API。Back Channel |
| `/admin/service-members` | POST | `{tenant_id, email, name?}`。users にいなければ cognito_sub なしでメールで作り、呼び出し元のサービスへの割り当てを upsert する。201 で `{user: {id, email, name, linked}}` | サービスの API。Back Channel |
| `/admin/service-members` | DELETE | `{tenant_id, user_id}`。呼び出し元のサービスへの割り当てを消す。204 | サービスの API。Back Channel |
| `/healthz` | GET | 死活監視 | 監視 |

ポータルの表示例。alice でログインした場合、「Tanaka Inc. (tanaka)」に CRM と CMS、「Suzuki Ltd. (suzuki)」に CRM を表示する。役割はサービスの DB にあるためポータルには出ない。契約があっても割り当てのないサービスは出ず、どのサービスにも割り当てがなければ「利用できるサービスがありません。管理者に招待を依頼してください。」と出る。各リンクは `https://<tenant>.<service>.sandbox.com/auth/login` で、サービスの `redirect_uri_template` をテナント slug で展開した origin から導く。Third-Party Initiated Login として通常の認可フローに合流する。

管理 API は Client 自身のサービスへの割り当てだけを操作できる。テナントがそのサービスを契約していなければ 403 `not_contracted`、テナントやユーザーがなければ 404、Client 認証に失敗すれば 401 `invalid_client`。`/token` と同じレート制限を通す。

## Tenant Web Application エンドポイント一覧

| エンドポイント | メソッド | 用途 |
| --- | --- | --- |
| `/auth/login` | GET | Host からテナントを解決し、認可リクエストを生成してリダイレクト |
| `/auth/callback` | GET | code受領、Back Channelで交換、ID Token の tenant_slug 検証、Tenant Session作成 |
| `/auth/logout` | POST | Tenant Logout |
| `/auth/backchannel-logout` | POST | Back-Channel Logout受信。aud が自サービスの client_id であることを確認し、sid に紐付く全テナントのセッションを削除 |
| `/dashboard` | GET | サーバー側でAccess Tokenを付与して `/v1/me` を呼び、role と権限の表を出す。React Router v7 の SPA に置き換えるまでのプレースホルダ |

`/auth/backchannel-logout` はテナントに依存しないため、サービスのベースホストで受ける。CRM は `https://crm.sandbox.com/auth/backchannel-logout`、CMS は `https://cms.sandbox.com/auth/backchannel-logout`。

## API Server エンドポイント規約

| 項目 | 規約 |
| --- | --- |
| 認証 | `Authorization: Bearer <access_token>` 必須 |
| aud | `API_BASE_URL` をそのまま aud とし、Token の aud と照合する。Host が `API_BASE_URL` のホストと異なれば 404。CRM の Token を api.cms に出すと 401 |
| テナント指定 | パスにtenant slugやIDを含めない。Tokenの `tenant_id` を唯一のテナントコンテキストとする |
| 共通ルート | `/v1/me` と `/v1/members` はどのサービスにも `packages/api-core` が付ける。`/v1/members` は一覧、招待、役割変更、権限の上書き、削除 |
| 例 | `GET /v1/end-users` はTokenのtenant_idに属する CRM のエンドユーザーのみ返す。`GET /v1/posts` は CMS の投稿 |
| 管理API | 複数テナントを扱う管理操作は別のaudとscopeを持つTokenを要求する。フェーズ2 |

## 環境変数

| アプリ | 変数 | 内容 |
| --- | --- | --- |
| crm-web / cms-web | `CLIENT_ID` `CLIENT_SECRET` `SERVICE_NAME` | このプロセスが担当するサービス。`crm` / `crm-v3R_5OBDCC6k8EeDKB6l5YltYVTSeJQZxpU-2-PE7VU` / `CRM` のように oidc_clients と oidc_client_secrets の登録値と一致させる。`CLIENT_SECRET` は active な secret のいずれかで、43 文字以上でなければ起動に失敗する |
| crm-web / cms-web | `BASE_HOST` `API_BASE_URL` | テナント slug を除いたホストと、呼び出す API の公開 URL。crm は `crm.localhost:3001` と `http://api.crm.localhost:3002`、cms は `cms.localhost:3003` と `http://api.cms.localhost:3004`。Host `<tenant>.<BASE_HOST>` からテナントを解決する |
| crm-web / cms-web | `PORT` `PUBLIC_SCHEME` `ISSUER` `AUTH_BACKCHANNEL_URL` `REDIS_URL` | 待ち受けポート、redirect_uri の scheme、Auth Server の issuer、サーバー間通信先、Session Store。`REDIS_URL` 未設定はインメモリ。Cookie の Secure と `__Host-` は `PUBLIC_SCHEME` が `https` のときに付き、そのときは `REDIS_URL` と https の `ISSUER` / `API_BASE_URL` が必須 |
| auth-api | `ISSUER` `DATABASE_URL` `COGNITO_ADAPTER` 等 | Client やテナントの設定は持たず、Identity DB から読む。`DATABASE_URL` は `postgres://sandbox_auth:sandbox_auth@127.0.0.1:5432/identity`。Cookie の Secure と `__Host-` は `ISSUER` が `https://` で始まるときに付き、そのときは `SIGNING_KEY_PEM` `REDIS_URL` `COGNITO_ADAPTER=sdk` が必須 |
| crm-api / cms-api | `API_BASE_URL` | この API の公開 URL。`http://api.crm.localhost:3002` / `http://api.cms.localhost:3004`。この値がそのまま aud になり、Host が URL のホストと異なるリクエストは 404 |
| crm-api / cms-api | `DATABASE_URL` | 自サービスの DB。`postgres://crm_app:crm_app@127.0.0.1:5433/crm` / `postgres://cms_app:cms_app@127.0.0.1:5434/cms`。identity DB には接続しない |
| crm-api / cms-api | `CLIENT_ID` `CLIENT_SECRET` | auth-api の管理 API を client_secret_basic で呼ぶための Client 認証。`*-web` と同じ値で、`CLIENT_SECRET` は 43 文字以上 |
| crm-api / cms-api | `PORT` `ISSUER` `AUTH_BACKCHANNEL_URL` | aud は `API_BASE_URL` と同じ値。provision が oidc_clients.audience に書く `apiBaseUrl` と一致させる。`AUTH_BACKCHANNEL_URL` は JWKS と管理 API の内部 URL。`PUBLIC_SCHEME` は持たない |
| provision | `SERVICES` `PUBLIC_SCHEME` | 全サービスの `clientId` `clientSecret` `name` `baseHost` `apiBaseUrl` の JSON 配列。oidc_clients、redirect_uri_template、oidc_client_secrets、backchannel_logout_uri の投入に使う。`redirect_uri_template` は `<PUBLIC_SCHEME>://{tenant}.<baseHost>/auth/callback` |

client_secret はローカルでは `crm-v3R_5OBDCC6k8EeDKB6l5YltYVTSeJQZxpU-2-PE7VU` と `cms-D-t4BfncXGWLx6FnGD0DW1gJroNFYm1GDm8QSgOYNLA` の固定値。本番は 32 バイト以上の乱数を Secret Store から各 web の `CLIENT_SECRET` と provision の `SERVICES` に注入する。どちらも 43 文字以上をスキーマで要求する。provision はサービスごとに active な secret を 1 行 upsert し、それ以外の active な secret を revoked にする。
環境変数の検証は `packages/shared` の `parseEnv` で行い、不足があれば起動を失敗させる。Cookie の Secure を外す変数は持たず、公開 scheme から導く。

## サービス追加手順

| 追加対象 | 手順 | 既存への影響 |
| --- | --- | --- |
| 新テナント | tenants にレコード追加。契約するサービスごとに tenant_services を登録。最初の管理者を tenant_service_members と、そのサービスの DB の members に役割付きで登録。以降はサービスの画面から招待する | なし。redirect_uri の登録、Client 登録、Secret 配布は不要 |
| 既存テナントの契約追加 | tenant_services を追加し、そのサービスの最初の管理者を tenant_service_members と members に登録する | なし |
| 利用者の招待 | サービスの画面から `POST /v1/members` に email と role を送る。サービスの API が auth-api の管理 API で tenant_service_members に「入れる」を登録し、自 DB の members に役割付きの行を作る。外すときは `DELETE /v1/members/:userId` で両方を消す | なし。同テナントの他サービスには影響しない |
| 権限の個別調整 | サービスの画面から `PUT /v1/members/:userId/permissions` で permission_overrides を置き換える。Auth Server には登録しない | なし。次のリクエストから反映 |
| 新サービス | oidc_clients に client_id、audience、`https://{tenant}.<service>.sandbox.com/auth/callback` の redirect_uri_template、backchannel_logout_uri を登録。oidc_client_secrets に active な secret を登録。契約テナント分の tenant_services を登録。`db/<service>/init` に members と permission_overrides と業務テーブルを持つ DB を用意。`apps/<service>-web` を追加して `packages/web-core` を環境変数で起動し、`apps/<service>-api` に `definition.ts` で役割と権限を宣言して routes を書き `packages/api-core` の `startApiCore` に渡す。provision の `SERVICES` に追加 | なし |
| client_secret のローテーション | oidc_client_secrets に新 secret を active で追加 → サービスの `CLIENT_SECRET` を差し替え → 旧行を revoked に更新 | なし。切替中は新旧どちらでも `/token` が通る |
| 管理画面 | 専用clientを登録し、管理用scopeを付与 | なし |

## 技術スタック

本サンドボックスの検証実装に用いる。他プロジェクト適用時は読み替える。

| 項目 | 採用 | 理由 |
| --- | --- | --- |
| 言語 | TypeScript | リポジトリ標準 |
| HTTPフレームワーク | Hono | 軽量。BFF / Auth / API を同一スタックで書ける |
| モノレポ | pnpm workspace | 雛形標準 |
| JWT / JWKS | jose | 標準準拠 |
| Cognito連携 | アダプタで抽象化 | ローカルはモック、本番は @aws-sdk/client-cognito-identity-provider |
| Session / Code Store | インターフェースで抽象化 | ローカルはインメモリ、本番はRedis |
| Identity DB とサービスの DB | PostgreSQL。サービスごとに別 DB | RLSによるTenant Isolation二重化が可能。サービスの DB は FORCE ROW LEVEL SECURITY を使う |
| テスト | Vitest | 雛形標準 |
