# multi-domain-sandbox

Cognito をユーザー認証基盤とし、auth.sandbox.com を独立した OpenID Provider として構築するマルチサービス・マルチテナント SSO 基盤の叩き台。
仕様と設計は [docs/](./docs/README.md)、実装規約は [ARCHITECTURE.md](./ARCHITECTURE.md) を参照する。

## モデル

- サービスは Auth Server を利用するプロダクト。OIDC Client 1 件に対応し、`client_id` はサービス ID。サンドボックスには `crm` と `cms` の 2 サービスがある
- テナントは顧客企業。サービスをまたいで共有される。サンドボックスには `tanaka` と `suzuki` の 2 テナントがある
- 契約は `identity.tenant_services` で表す。tanaka は crm と cms、suzuki は crm だけを契約している。購買、請求、席数、解約は会社単位で行う
- identity DB が持つのは「誰がどのテナントのどのサービスに入れるか」まで。`identity.tenant_service_members` がテナント × サービス × ユーザーの割り当てを持ち、`/authorize` と Refresh はこの表でログイン可否を決める。役割は持たない。`identity.tenant_members` は管理者や請求担当のような会社横断の役割にだけ使い、ログイン可否には使わない
- 役割と権限はサービスごとに、そのサービスの DB が持つ。`crm.members` と `cms.members` が役割を、`permission_overrides` が役割の既定に対する allow / deny を持つ。役割の語彙はサービスごとに違い、CRM は owner / admin / member / viewer、CMS は owner / editor / viewer。API がリクエストごとに読み、deny が優先する。Token には役割も権限も載せない
- DB はサービスごとに分かれる。auth-api は identity DB、crm-api は crm DB、cms-api は cms DB にしか接続しない。DB 間の外部キーや JOIN はなく、共有するのは user_id と tenant_id の値だけ
- 招待はサービスの画面から行う。サービスの API が auth-api の管理 API を client_secret_basic で呼んで「入れる」を登録し、その user_id で自分の DB に役割付きの member 行を作る。identity にいない人はメールで事前作成され、初回ログイン時に Cognito の sub がメールで紐付く
- ホストは `<tenant>.<service>.<domain>`。本番なら tanaka.crm.com、suzuki.crm.com、tanaka.cms.com に相当する
- 認可リクエストのテナントは `client_id` と `redirect_uri` の組で決まる。サービスは `http://{tenant}.crm.localhost:3001/auth/callback` のような `redirect_uri_template` を 1 つ持ち、redirect_uri をテンプレートに当てて取り出した slug で `tenants` を引く。テナント追加に redirect_uri の登録は要らない

## 他リポジトリへの導入

既存サービスへ同じ仕組みを入れるための自己完結ガイドを [docs/integration-guide.md](./docs/integration-guide.md) に置いている。仕様、全 URL とパラメータの詳細設計、誰が何を渡して何を受け取るかを書いたシーケンス図、サブドメインに依存せず別ドメインでも動く理由、Next.js 構成への読み替え、参考資料をまとめてある。導入先のリポジトリへはこのファイルをそのままコピーして使う。

## 構成

| ディレクトリ | 役割 | ローカルホスト |
| --- | --- | --- |
| `apps/auth-api` | OpenID Provider。ログイン画面、認可、Token 発行、SSO Session、ポータル、サービス向けの管理 API。画面は当面ここで配信し、React の auth-web は次段階で分離する | http://auth.localhost:3000 |
| `apps/crm-web` | CRM の Tenant Web Application。React Router の SPA と薄い BFF。1 プロセスで CRM の全テナントのホストを受ける。`src/main.ts` は `startWebCore("crm-web")` を呼ぶだけで、`app/` にホーム、エンドユーザー、管理アカウントの画面を持つ | http://tanaka.crm.localhost:3001 / http://suzuki.crm.localhost:3001 |
| `apps/crm-api` | CRM の Resource Server。`definition.ts` に役割と権限、`end-users/` にエンドユーザーの CRUD とマスキング。`main.ts` は定義と routes を `startApiCore` に渡す | http://api.crm.localhost:3002 |
| `apps/cms-web` | CMS の Tenant Web Application。crm-web と同じ構成で、`app/` にホーム、投稿、管理アカウントの画面を持つ | http://tanaka.cms.localhost:3003 / http://suzuki.cms.localhost:3003 |
| `apps/cms-api` | CMS の Resource Server。`definition.ts` に役割と権限、`posts/` に投稿の CRUD | http://api.cms.localhost:3004 |
| `packages/web-core` | `apps/*-web` の BFF 本体。`/auth/*` の受け口、SPA に状態を渡す `/session`、API への中継 `/api/*`、SPA の配信、エラー画面、設定スキーマ `config.ts`、起動関数 `start.ts`、テストを持つ。Token をブラウザへ出さない | |
| `packages/web-ui` | `apps/*-web` が共有する React コード。BFF との通信 `api.ts`、ルートの clientLoader と共通の枠 `shell.tsx`、CRM と CMS で同じ管理アカウント画面 `members-page.tsx`、`styles.css` | |
| `packages/api-core` | `apps/*-api` のフレームワーク。`ServiceDefinition` で役割と権限を宣言させ、Token 検証、自サービス DB の member 行の解決、権限の確定、`/v1/me`、管理アカウントの `/v1/members`、`MemberRepository`、auth-api の管理 API を呼ぶ `AuthAdminClient`、RLS 用の `withTenant`、設定スキーマ、起動関数を持つ。auth-api は使わない | |
| `packages/shared` | Result 型、KV ストアと StoreFactory、PKCE、AES-GCM、secret の SHA-256 ハッシュ、redirect_uri テンプレート、JWT と JWKS 取得、Cookie、ロガー、環境変数の検証、pg 接続、識別子の enum、セッション期限、OIDC のワイヤ契約 | |
| `packages/oidc-client` | Tenant Web Application 向け OIDC Client 共通モジュール | |
| `db/identity` | identity DB の初期化 SQL。ロール `sandbox_auth`、`identity` スキーマ、シード | |
| `db/crm` `db/cms` | サービスごとの DB の初期化 SQL。ロール `crm_app` / `cms_app`、`members` `permission_overrides` と業務テーブル、RLS、シード | |
| `tools/provision` | RDS の identity スキーマ作成、Cognito テストユーザー作成、シード投入。ECS の一回限りタスク。サービスの DB は扱わない | |
| `terraform` | AWS 構成。ECS Fargate + ALB、RDS、ElastiCache、Cognito、Route 53、ACM | |
| `scripts/smoke.ts` | 起動中のサーバーに対する実 HTTP の疎通確認。SPA が使う `/session` と `/api/v1/me` の JSON を直接叩き、別サービスへの SSO、サービスごとの役割と権限、未契約サービスの拒否まで確認する | |
| `scripts/chrome-check.ts` | 実 Chrome での受け入れ確認。SPA を実際に描画し、画面の文字列が出るまで待って確認する | |
| `scripts/deploy.sh` 他 | AWS へのビルドと apply。手順は [docs/deploy.md](./docs/deploy.md) | |

## 前提

- Node.js 24 と pnpm 10。`.tool-versions` で固定
- Docker。PostgreSQL 16 のコンテナを identity / crm / cms の 3 つ起動する
- ブラウザは `*.localhost` を 127.0.0.1 に解決する。Chrome / Firefox / Safari はそのまま動く
- Node.js 24 も `*.localhost` をループバックに解決する。crm-web から api.crm.localhost を呼ぶためのホストファイル編集は不要

## セットアップ

```bash
pnpm install
pnpm db:up
```

`pnpm db:up` は `docker-compose.yml` の 3 つの PostgreSQL と Redis を起動する。初回起動時に各コンテナが `db/<name>/init` の SQL を適用する。スキーマやシードを変えたときは `pnpm db:reset` でボリュームごと作り直す。

| コンテナ | ポート | データベース | アプリのロール | 初期化 SQL | 接続するアプリ |
| --- | --- | --- | --- | --- | --- |
| `db-identity` | 5432 | `identity` | `sandbox_auth` | `db/identity/init/001_roles.sql` `002_identity.sql` `003_seed.sql` | auth-api |
| `db-crm` | 5433 | `crm` | `crm_app` | `db/crm/init/001_schema.sql` `002_seed.sql` | crm-api |
| `db-cms` | 5434 | `cms` | `cms_app` | `db/cms/init/001_schema.sql` `002_seed.sql` | cms-api |

各アプリの `.env.example` をコピーして `.env` を作る。ローカル検証用の値がそのまま入っている。

```bash
cp apps/auth-api/.env.example apps/auth-api/.env
cp apps/crm-web/.env.example apps/crm-web/.env
cp apps/crm-api/.env.example apps/crm-api/.env
cp apps/cms-web/.env.example apps/cms-web/.env
cp apps/cms-api/.env.example apps/cms-api/.env
```

サービスとホストに関わる環境変数は次のとおり。`*-web` と `*-api` は 1 プロセス 1 サービスで、担当するサービスを環境変数で与える。スキーマは `packages/web-core/src/config.ts` と `packages/api-core/src/config.ts` にあり、apps 側には設定コードを置かない。

| アプリ | 変数 | 内容 |
| --- | --- | --- |
| crm-web / cms-web | `CLIENT_ID` `CLIENT_SECRET` `SERVICE_NAME` | このプロセスが担当するサービス。oidc_clients と oidc_client_secrets の登録値と一致させる。`CLIENT_SECRET` は active な secret のいずれかで、43 文字以上でなければ起動に失敗する |
| crm-web / cms-web | `BASE_HOST` `PUBLIC_SCHEME` | テナントのサブドメインを除いたホストと redirect_uri の scheme。`crm.localhost:3001` / `cms.localhost:3003`。Host `<tenant>.<BASE_HOST>` からテナント slug を決め、`<PUBLIC_SCHEME>://<host>/auth/callback` を redirect_uri にする。oidc_clients の `redirect_uri_template` を展開した値と一致する。`https` にすると Cookie に Secure と `__Host-` が付き、`REDIS_URL` と https の `ISSUER` / `API_BASE_URL` と `SPA_DIR` が必須になる |
| crm-web / cms-web | `API_BASE_URL` | 呼び出す API の公開 URL。`http://api.crm.localhost:3002` / `http://api.cms.localhost:3004`。BFF の `/api/*` がここへ中継する |
| crm-web / cms-web | `SPA_DIR` `SPA_DEV_SERVER_URL` | SPA の配り方。`SPA_DIR=build/client` なら `react-router build` の成果物を配る。`SPA_DEV_SERVER_URL=http://127.0.0.1:5173` なら `react-router dev` の Vite へ中継する。cms-web は 5174。両方あれば `SPA_DIR` を優先し、両方なければ `/auth/*` `/session` `/api/*` だけを返して警告を出す |
| auth-api | `ISSUER` `DATABASE_URL` | Auth Server の公開 URL と identity DB の接続 URL。`postgres://sandbox_auth:sandbox_auth@127.0.0.1:5432/identity`。`ISSUER` が `https://` で始まると Cookie に Secure と `__Host-` が付き、`SIGNING_KEY_PEM` `REDIS_URL` `COGNITO_ADAPTER=sdk` が必須になる |
| crm-api / cms-api | `API_BASE_URL` | この API の公開 URL。`http://api.crm.localhost:3002` / `http://api.cms.localhost:3004`。この値がそのまま aud になり、oidc_clients.audience と一致させる。Host が URL のホストと異なるリクエストは 404。`*-api` は `PUBLIC_SCHEME` を持たない |
| crm-api / cms-api | `DATABASE_URL` | 自サービスの DB。`postgres://crm_app:crm_app@127.0.0.1:5433/crm` / `postgres://cms_app:cms_app@127.0.0.1:5434/cms`。identity DB には接続しない |
| crm-api / cms-api | `CLIENT_ID` `CLIENT_SECRET` `AUTH_BACKCHANNEL_URL` | auth-api の管理 API を client_secret_basic で呼ぶための Client 認証。`*-web` と同じ値で、`CLIENT_SECRET` は 43 文字以上。`AUTH_BACKCHANNEL_URL` は JWKS 取得と管理 API の呼び出し先 |
| provision | `SERVICES` `PUBLIC_SCHEME` | 全サービスの `clientId` `clientSecret` `name` `baseHost` `apiBaseUrl` の JSON 配列。本番ホストで oidc_clients、`<PUBLIC_SCHEME>://{tenant}.<baseHost>/auth/callback` の redirect_uri_template、oidc_client_secrets を投入する |

## 起動

```bash
pnpm dev
```

auth-api / crm-web / crm-api / cms-web / cms-api の 5 アプリが同時に起動する。crm-web と cms-web は BFF と `react-router dev` の Vite を並行して起動し、BFF が Vite へ中継する。ブラウザで http://tanaka.crm.localhost:3001/ を開く。Vite のポート 5173 / 5174 は直接開かない。

本番相当で動かすときは SPA をビルドし、`SPA_DIR` を指して BFF だけを起動する。

```bash
pnpm build
SPA_DIR=build/client pnpm --filter @sandbox/crm-web start
```

`pnpm build` は各 web アプリで `react-router build` を実行し、`apps/<service>-web/build/client` を作る。`start` は BFF だけを起動し、`SPA_DIR` があれば Vite へ中継しない。

## ローカルのサービスとテナント

| サービス | id | client_id | client_secret | redirect_uri_template | API |
| --- | --- | --- | --- | --- | --- |
| CRM | `01J00000000000000000000CRM` | `crm` | `crm-v3R_5OBDCC6k8EeDKB6l5YltYVTSeJQZxpU-2-PE7VU` | `http://{tenant}.crm.localhost:3001/auth/callback` | http://api.crm.localhost:3002 |
| CMS | `01J00000000000000000000CMS` | `cms` | `cms-D-t4BfncXGWLx6FnGD0DW1gJroNFYm1GDm8QSgOYNLA` | `http://{tenant}.cms.localhost:3003/auth/callback` | http://api.cms.localhost:3004 |

client_secret は `identity.oidc_client_secrets` に SHA-256 ハッシュで入っている。シードの行は `01J0000000000000000CRMSEC1` と `01J0000000000000000CMSSEC1`。サービスは active な secret を複数持てるため、新しい secret を追加してから `CLIENT_SECRET` を差し替え、最後に旧行を revoked にすれば無停止で切り替えられる。client_secret は 32 バイト以上の乱数にし、`CLIENT_SECRET` と provision の `SERVICES[].clientSecret` は 43 文字以上でなければ起動に失敗する。ローカルの固定値も公開前提の値でこの長さを満たす。同じ値を `*-web` と `*-api` の両方に与える。web は `/token` の Client 認証に、api は auth-api の管理 API の Client 認証に使う。

| テナント | id | 名前 | 契約サービス |
| --- | --- | --- | --- |
| tanaka | `01J00000000000000000TANAKA0` | Tanaka Inc. | crm、cms |
| suzuki | `01J00000000000000000SUZUKI0` | Suzuki Ltd. | crm |

会社のオンボーディングは次の行を足すだけでよい。redirect_uri はテンプレートから導くため、テナントごとの登録はなく、会社ごとの Client 登録もサービスごとのテナントも要らない。

1. `identity.tenants` に 1 行
2. 契約するサービスごとに `identity.tenant_services` に 1 行。CRM だけなら 1 行
3. 最初の管理者を `identity.tenant_service_members` に 1 行と、そのサービスの DB の `members` に役割付きで 1 行。以降の人はサービスの画面から招待する
4. 後から CMS を足すときは `tenant_services` に 1 行と、CMS の最初の管理者の割り当てを足す
5. 役割より細かい許可 / 拒否が要るときは、そのサービスの画面から `permission_overrides` を編集する

suzuki.cms.localhost:3003 は cms のテンプレートに一致し suzuki も既知のテナントだが、契約がないため開いても `access_denied` になる。テンプレートに一致しない redirect_uri や、`nobody.crm.localhost:3001` のように tenants にない slug は `invalid_redirect_uri` でリダイレクトせず 400 になる。

## ローカルユーザー

Cognito はモックアダプタで代替している。`apps/auth-api/.env.example` の `MOCK_COGNITO_USERS` と `db/identity/init/003_seed.sql` が対応する。

| ユーザー | パスワード | identity | tanaka × crm | tanaka × cms | suzuki × crm | tenant_members |
| --- | --- | --- | --- | --- | --- | --- |
| alice | alice-password | あり | 入れる | 入れる | 入れる | tanaka の owner |
| bob | bob-password | あり | 割り当てなし | 割り当てなし | 入れる | suzuki の owner |
| carol | carol-password | なし | 割り当てなし | 割り当てなし | 割り当てなし | なし |
| dave | dave-password | なし | 割り当てなし | 割り当てなし | 割り当てなし | なし |

identity の `tenant_service_members` は「入れるか」だけを持つ。carol と dave はモック Cognito にだけ存在し、初回ログインで users に JIT 作成される。dave はサービスの画面から招待して初回ログインでメールにより紐付ける確認用で、シードの users にはいない。
ログイン時の users の解決は cognito_sub → 同じメールで cognito_sub が未設定の行 → JIT 作成の順。同じメールが別の Cognito ユーザーに既に紐付いている場合はログインを拒否し、既存行を書き換えない。

役割と権限はサービスの DB にある。CRM の役割は `db/crm/init/002_seed.sql`、CMS の役割は `db/cms/init/002_seed.sql`。

| ユーザー | crm.members | crm.permission_overrides | cms.members | cms.permission_overrides |
| --- | --- | --- | --- | --- |
| alice | tanaka で owner、suzuki で viewer | suzuki で `end_users:unmask` を allow | tanaka で owner | tanaka で `posts:create` を deny |
| bob | suzuki で admin | なし | なし | なし |

auth を通れるのに member 行がない人は、最初の API 呼び出しでそのサービスの最下位の役割で member 行が作られる。CRM も CMS も最下位は viewer。

業務データのシード。

| DB | テーブル | 内容 |
| --- | --- | --- |
| crm | `end_users` | tanaka に 3 件、suzuki に 2 件。名前、メール、電話、メモを持つ顧客データ |
| cms | `posts` | tanaka に「はじめての投稿」「お知らせ」の 2 件。author は alice |

## サービスの機能

CRM の役割と権限。`apps/crm-api/src/definition.ts`。

| 役割 | end_users:read | end_users:create | end_users:update | end_users:delete | end_users:unmask | members:read | members:invite | members:manage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| owner | yes | yes | yes | yes | yes | yes | yes | yes |
| admin | yes | yes | yes | yes | yes | yes | yes | no |
| member | yes | yes | yes | no | no | yes | no | no |
| viewer | yes | no | no | no | no | yes | no | no |

- エンドユーザーの一覧と CRUD。`end_users:unmask` がなければメールは `a***@example.com`、電話は `***-****-1234` の形でマスクして返し、応答に `masked: true` が付く。suzuki の alice は viewer だが allow の上書きでマスクなしに読める
- 管理アカウントの一覧、招待、役割の変更、権限の上書きの編集、削除。招待は auth-api の管理 API を経由する

CMS の役割と権限。`apps/cms-api/src/definition.ts`。

| 役割 | posts:read | posts:create | posts:update | posts:delete | members:read | members:invite | members:manage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| owner | yes | yes | yes | yes | yes | yes | yes |
| editor | yes | yes | yes | yes | yes | no | no |
| viewer | yes | no | no | no | yes | no | no |

- 投稿の一覧と CRUD。タイトル、本文、author_id を持ち、author_id は呼び出したユーザー
- 管理アカウントの招待と権限編集は CRM と同じ仕組みで、語彙だけが違う。CRM の `admin` を CMS に送ると `invalid_request` になる

`members:read` `members:invite` `members:manage` はどのサービスにも `packages/api-core` が自動で足す。

## API のエンドポイント

すべて `Authorization: Bearer <access_token>` を要求し、Host が `API_BASE_URL` のホストと違えば 404。tenant_id は Token の値だけを使う。

| エンドポイント | 要求 permission | 内容 |
| --- | --- | --- |
| `GET /v1/me` | なし | 自分の user と tenant、このサービスでの role、確定した permissions のソート済み配列、サービスの roles と permissions の語彙 |
| `GET /v1/members` | members:read | 管理アカウントの一覧 |
| `GET /v1/members/:userId` | members:read | 1 人の役割、上書きの一覧、確定した permissions |
| `POST /v1/members` | members:invite | `{email, name?, role}` で招待。auth-api の管理 API で「入れる」を登録してから自 DB に member 行を作り、201 で `member` と `linked` を返す |
| `PATCH /v1/members/:userId` | members:manage | `{role}` で役割を変える |
| `PUT /v1/members/:userId/permissions` | members:manage | `{overrides: [{permission, effect}]}` で上書きを置き換える。effect は allow / deny |
| `DELETE /v1/members/:userId` | members:manage | auth-api で割り当てを外してから自 DB の member 行を消す。自分自身は 400 `cannot_remove_self` |
| `GET /v1/end-users` `GET /v1/end-users/:id` | end_users:read | CRM。unmask がなければマスクして返す |
| `POST /v1/end-users` | end_users:create | CRM。201 |
| `PATCH /v1/end-users/:id` | end_users:update | CRM。部分更新 |
| `DELETE /v1/end-users/:id` | end_users:delete | CRM。204 |
| `GET /v1/posts` `GET /v1/posts/:id` | posts:read | CMS |
| `POST /v1/posts` | posts:create | CMS。201 |
| `PATCH /v1/posts/:id` | posts:update | CMS。部分更新 |
| `DELETE /v1/posts/:id` | posts:delete | CMS。204 |

auth-api の管理 API。Back Channel 専用で `Authorization: Basic base64(client_id:client_secret)` を要求し、呼び出した Client 自身のサービスへの割り当てだけを操作できる。`/token` と同じレート制限を通す。

| エンドポイント | 内容 |
| --- | --- |
| `GET /admin/service-members?tenant_id=` | そのテナントでこのサービスに入れる人の一覧。`linked` は初回ログイン済みか |
| `POST /admin/service-members` | `{tenant_id, email, name?}`。users にいなければ cognito_sub なしでメールで作り、割り当てを upsert する。201 で `{user: {id, email, name, linked}}` |
| `DELETE /admin/service-members` | `{tenant_id, user_id}`。割り当てを消す。204 |

エラーは `tenant_not_found` 404、`not_contracted` 403、`user_not_found` 404、Client 認証失敗は 401 `invalid_client`。

## 画面

`*-web` の画面は React Router v8 の SPA で、`apps/<service>-web/app` にある。BFF は Token を持ったまま `/session` でログイン状態と CSRF トークンだけを渡し、SPA は `/api/*` 経由でサービスの API を呼ぶ。ブラウザに Token は届かない。

| 画面 | パス | 内容 |
| --- | --- | --- |
| ホーム | `/` | 役割と権限の表。そのサービスの全 permission について yes / no を示す |
| エンドユーザー | `/end-users` | CRM。一覧と作成、更新、削除。`end_users:unmask` がなければ「メールと電話はマスクされています」、あれば「メールと電話をそのまま表示しています」と出る。作成、更新、削除のボタンは `end_users:create` `end_users:update` `end_users:delete` があるときだけ出る |
| 投稿 | `/posts` | CMS。一覧と作成、編集、削除。`posts:create` がなければ「投稿を作成できません」と出る |
| 管理アカウント | `/members` | CRM と CMS で同じ画面。一覧、メールと名前と役割での招待、役割の変更、権限の上書きの編集、削除。役割と権限の語彙は `/v1/me` の `service.roles` と `service.permissions` から取る |

画面の出し分けは `/v1/me` の `permissions` で行い、最終判定は API がする。ヘッダにはサービス名、テナント、ユーザーと役割、ナビゲーション、このテナントからのログアウト、全体からログアウトのリンクが並ぶ。未ログインで開くと SPA が `/session` を見て `/auth/login` へ遷移する。

## 確認できる挙動

1. tanaka.crm に未ログインでアクセスすると SPA が `/session` で未ログインを知り、`/auth/login` を経て auth.localhost のログイン画面へ遷移する
2. alice でログインすると tanaka のホームに「tanaka の CRM に owner としてログインしています」と CRM の権限の表が出る。`end_users:create` は yes。Cookie は tanaka.crm.localhost と auth.localhost にだけ発行される
3. そのまま suzuki.crm を開くとログイン画面なしで入れる。role は viewer で `end_users:create` は no だが、上書きにより `end_users:unmask` は yes
4. そのまま tanaka.cms を開くと、別サービスでもログイン画面なしで入れる。セッションは crm と別に作られ、Access Token の aud は cms の API になる。role は owner だが、cms 側の deny により `posts:create` は no で `posts:update` は yes
5. suzuki.cms を開くと 403 になり「テナント suzuki は CMS を契約していません」と表示される。SSO Session は残る
6. tanaka.crm でログアウトすると `/?logged_out=1` に戻り「ログアウトしました」と出る。suzuki.crm と tanaka.cms はログイン済みのまま。「もう一度ログインする」を押すと SSO Session によりパスワードなしで再ログインされる
7. ヘッダの「全体からログアウト」を押すと auth.localhost の確認画面に移り、SSO Session とすべてのサービス・テナントのセッションが無効化される。完了画面には「CRM (tanaka) に戻る」のように戻り先のリンクが出る
8. bob で tanaka.crm を開くとアクセス権なしの画面になる。tanaka の crm に割り当てがないため。ログイン自体は成功しており suzuki.crm には入れる
9. carol はどのサービスにも割り当てられていないため、どのホストを開いてもアクセス権なしになる
10. http://auth.localhost:3000/ を直接開くとポータルになる。未ログインならログインフォーム、ログイン後はテナントごとに割り当てのあるサービスが並び、各サービスへパスワードなしで入れる。役割はサービスが持つためポータルには出ない。契約があっても割り当てのないサービスは出ない。carol には「利用できるサービスがありません。管理者に招待を依頼してください。」と出る
11. alice の Token で `POST /v1/members` に dave のメールを送ると、auth-api が users に dave をメールで作って tanaka × crm に割り当て、crm の members に指定した役割で行ができる。dave でログインすると同じメールの users 行に Cognito の sub が紐付き、tanaka.crm に入れる

## Tenant Logout の挙動について

サービスの「ログアウト」はそのサービス × テナントのセッションだけを消し、auth.localhost の SSO Session は残す。仕様書 19.1 のとおり。
そのためログアウト直後に「もう一度ログインする」を押すと、認可リクエストが auth に飛び、SSO Session によりログイン画面なしで再ログインされる。Google のサービスからログアウトしても Google アカウント自体はログインしたまま、という関係と同じ。
Sandbox 全体からログアウトしたい場合は、ログイン中のヘッダにある「全体からログアウト」かポータルの「Sandbox 全体からログアウト」を使う。URL は `http://auth.localhost:3000/logout?client_id=crm&tenant=tanaka` の形で、戻り先の表示に使う。この挙動は 2026-09-09 に現状維持と決定した。

## アクセス拒否の理由

`/authorize` は user → tenant → 契約 → サービスへの割り当て の順に確認し、失敗すると `redirect_uri` へ `error=access_denied&error_description=<reason>` で戻す。`*-web` は 403 画面を出し、SSO Session は残る。Refresh 時も同じ確認を行う。

| reason | 意味 |
| --- | --- |
| `user_disabled` | users.status が active でない |
| `tenant_suspended` | tenants.status が active でない |
| `not_contracted` | tenant_services に契約がない。suzuki.cms がこれに当たる |
| `no_membership` | tenant_service_members にこのテナント × このサービスの割り当てがない。bob の tanaka、carol の全ホストがこれに当たる。別サービスの割り当てや tenant_members の会社横断の役割では通らない |
| `membership_inactive` | tenant_service_members.status が active でない |

API は identity DB を見ない。Token の `tenant_id` と `sub` で自サービス DB の member 行を毎リクエスト読み、役割の既定に `permission_overrides` を重ねて権限を確定する。Token には role も permission も載せないため、役割や権限の変更は次のリクエストから反映される。割り当てを外された人は Refresh で `invalid_grant` になり、最大 15 分で API を呼べなくなる。

## ローカル運用の注意

- `REDIS_URL` 未設定のため SSO Session、認可リクエスト、Tenant Session はインメモリに保持している。`pnpm dev` を再起動するとすべて消えるため、再起動後はサービスの URL を開き直してログインする
- ログイン画面を開いたまま 30 分以上放置すると「ログイン画面を開いてから時間が経ちすぎた」旨のエラーになる。サービスの URL を開き直せばよい
- 署名鍵は起動ごとに生成される。再起動前に発行された Access Token は API Server で検証に失敗し、Tenant Session が破棄されて再ログインになる
- `*-api` は `API_BASE_URL` をそのまま aud にする。Host が `API_BASE_URL` のホストと異なるリクエストは 404、crm 向けの Access Token を api.cms.localhost:3004 に送ると 401 になる
- 招待で作った users 行と member 行はコンテナのボリュームに残る。`pnpm db:reset` でシードの状態に戻る

## 検証

```bash
pnpm typecheck
pnpm lint
pnpm test
```

テストはサーバーを起動せずに Hono の `app.request()` で実行する。`packages/web-core/src/app.test.ts` は auth-api と、サービスごとの web インスタンスと実物の crm-api / cms-api をプロセス内で接続し、Cookie ジャー付きの簡易ブラウザで `/auth/login?return_to=` からログインし、`/session` と `/api/v1/me` の JSON で別テナント SSO、別サービス SSO、未契約サービスの拒否、tanaka.cms の owner が cms 側の deny で `posts:create` を持たないこと、Logout までを通す。SPA は配らず、`/auth/*` `/session` `/api/*` を検証する。テストは 135 件。管理 API による招待と初回ログインでの紐付け、割り当ての解除、CRM のマスキングと CRUD と役割ごとの可否と member 行の JIT 作成、CMS の投稿と editor の招待と役割語彙の分離、JWKS の強制再取得の間引き、同じ Refresh Token の同時提示、別 Client からの Refresh、再ログイン時の旧 SSO Session 破棄、ログインのレート制限、Tenant 側の同時 Refresh のような並行性と悪用への耐性も含む。

起動中のサーバーと PostgreSQL に対する実 HTTP の確認は次で行う。SPA が使う `/session` と `/api/v1/me` の JSON を直接叩き、tanaka.crm でのログインと owner の権限、suzuki.crm への SSO と viewer の権限、tanaka.cms への SSO と cms の語彙、cms 側の deny、suzuki.cms の拒否、Tenant Logout、Cookie に JWT がないことを 9 項目で確認する。

```bash
pnpm smoke
```

実 Chrome で SPA を描画して確認する場合は次を使う。ログイン後のホーム、エンドユーザー一覧、別テナントと別サービスへの SSO、投稿一覧、未契約サービスの拒否、Tenant Logout、ポータルからの SSO と Global Logout まで 11 項目を確認する。SPA は読み込み後に `/session` と `/api` を読んでから描くため、画面の文字列が出るまで待って判定する。

```bash
pnpm chrome-check
```

## AWS へのデプロイ

`terraform/` と `scripts/deploy.sh` で ECS Fargate に載せる。手順と構成は [docs/deploy.md](./docs/deploy.md) を参照する。ローカルとの差分は環境変数で切り替える。
AWS 側はまだテナントごとに Client を持ち単一の RDS を使う旧構成のままで、サービス × テナントのホスト構成とサービスごとの DB への移行は別作業とする。

| 項目 | ローカル | AWS |
| --- | --- | --- |
| Cognito | `COGNITO_ADAPTER=mock` | `COGNITO_ADAPTER=sdk`。USER_SRP_AUTH で実 User Pool に接続 |
| Session / Code Store | `REDIS_URL` 未設定でインメモリ | `REDIS_URL` で ElastiCache Redis |
| 署名鍵 | 起動ごとに生成 | `SIGNING_KEY_PEM` を Secrets Manager から注入 |
| Cookie | プレフィックスなし。`ISSUER` と `PUBLIC_SCHEME` が http | `ISSUER` が https、`PUBLIC_SCHEME` が https のとき `__Host-` / `__Secure-`。専用の切り替え変数はない。https のとき auth-api は `SIGNING_KEY_PEM` `REDIS_URL` `COGNITO_ADAPTER=sdk`、`*-web` は `REDIS_URL` と https の `ISSUER` / `API_BASE_URL` と `SPA_DIR` がないと起動しない |
| SPA の配信 | `SPA_DEV_SERVER_URL` で `react-router dev` の Vite へ中継 | `pnpm build` の `build/client` を `SPA_DIR` で配る。Vite への中継は使えない |
| client_secret | `CLIENT_SECRET` のローカル固定値。`crm-v3R_5OBDCC6k8EeDKB6l5YltYVTSeJQZxpU-2-PE7VU` / `cms-D-t4BfncXGWLx6FnGD0DW1gJroNFYm1GDm8QSgOYNLA` | Terraform が 32 バイト以上の乱数を生成し Secrets Manager に保存。provision が oidc_client_secrets に active で upsert する。どちらも 43 文字以上 |
| API の aud | `API_BASE_URL` の `http://api.crm.localhost:3002` / `http://api.cms.localhost:3004` | 同じ仕組みで `https://api.<service>.<domain>` |
| DB | docker compose の 3 コンテナが初期化 SQL を適用 | identity は provision タスクがスキーマとシードを投入。crm / cms の DB は未整備で、`db/<service>/init` を別途適用する必要がある |

## フェーズ2

- MFA チャレンジ。`/login/challenge`
- Refresh Token 系列の永続化と監視
- 複数テナントをまたぐ管理 API と `admin` scope
- auth-api のログイン画面とポータルを `auth-web` として分離する
