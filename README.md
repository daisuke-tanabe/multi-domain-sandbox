# multi-domain-sandbox

Cognito をユーザー認証基盤とし、auth.sandbox.com を独立した OpenID Provider として構築するマルチサービス・マルチテナント SSO 基盤の叩き台。
仕様と設計は [docs/](./docs/README.md)、実装規約は [ARCHITECTURE.md](./ARCHITECTURE.md) を参照する。

## モデル

- サービスは Auth Server を利用するプロダクト。OIDC Client 1 件に対応し、`client_id` はサービス ID。サンドボックスには `crm` と `cms` の 2 サービスがある
- テナントは顧客企業。サービスをまたいで共有される。サンドボックスには `tanaka` と `suzuki` の 2 テナントがある
- 契約は `identity.tenant_services` で表す。tanaka は crm と cms、suzuki は crm だけを契約している
- ホストは `<tenant>.<service>.<domain>`。本番なら tanaka.crm.com、suzuki.crm.com、tanaka.cms.com に相当する
- 認可リクエストのテナントは `client_id` と `redirect_uri` の組で決まる。サービスは `http://{tenant}.crm.localhost:3001/auth/callback` のような `redirect_uri_template` を 1 つ持ち、redirect_uri をテンプレートに当てて取り出した slug で `tenants` を引く。テナント追加に redirect_uri の登録は要らない

## 他リポジトリへの導入

既存サービスへ同じ仕組みを入れるための自己完結ガイドを [docs/integration-guide.md](./docs/integration-guide.md) に置いている。仕様、全 URL とパラメータの詳細設計、誰が何を渡して何を受け取るかを書いたシーケンス図、サブドメインに依存せず別ドメインでも動く理由、Next.js 構成への読み替え、参考資料をまとめてある。導入先のリポジトリへはこのファイルをそのままコピーして使う。

## 構成

| ディレクトリ | 役割 | ローカルホスト |
| --- | --- | --- |
| `apps/auth-api` | OpenID Provider。ログイン画面、認可、Token 発行、SSO Session、ポータル。画面は当面ここで配信し、React の auth-web は次段階で分離する | http://auth.localhost:3000 |
| `apps/crm-web` | CRM の Tenant Web Application。BFF。1 プロセスで CRM の全テナントのホストを受ける。`main.ts` は `startServiceWeb("crm-web")` を呼ぶだけ | http://tanaka.crm.localhost:3001 / http://suzuki.crm.localhost:3001 |
| `apps/crm-api` | CRM の Resource Server。Bearer 検証、Membership 認可、RLS。`main.ts` は `startServiceApi("crm-api")` を呼ぶだけ | http://api.crm.localhost:3002 |
| `apps/cms-web` | CMS の Tenant Web Application。crm-web と同じ実装をサービス設定だけ変えて起動する | http://tanaka.cms.localhost:3003 / http://suzuki.cms.localhost:3003 |
| `apps/cms-api` | CMS の Resource Server。crm-api と同じ実装 | http://api.cms.localhost:3004 |
| `packages/service-web` | `*-web` が共有する Hono アプリ。画面、API 呼び出し、設定スキーマ `config.ts`、起動関数 `start.ts`、テスト | |
| `packages/service-api` | `*-api` が共有する Hono アプリ。テナントコンテキスト解決の usecase、認証ミドルウェア、権限、ルート、アダプタ、設定スキーマ、起動関数、テスト | |
| `packages/shared` | Result 型、KV ストアと StoreFactory、PKCE、AES-GCM、secret の SHA-256 ハッシュ、redirect_uri テンプレート、JWT と JWKS 取得、Cookie、ロガー、環境変数の検証、pg 接続、識別子の enum、セッション期限、OIDC のワイヤ契約 | |
| `packages/oidc-client` | Tenant Web Application 向け OIDC Client 共通モジュール | |
| `db/init` | PostgreSQL のロール、スキーマ、RLS、シード | |
| `tools/provision` | RDS のスキーマ作成、Cognito テストユーザー作成、シード投入。ECS の一回限りタスク | |
| `terraform` | AWS 構成。ECS Fargate + ALB、RDS、ElastiCache、Cognito、Route 53、ACM | |
| `scripts/smoke.ts` | 起動中のサーバーに対する実 HTTP の疎通確認。別サービスへの SSO と未契約サービスの拒否まで確認する | |
| `scripts/chrome-check.ts` | 実 Chrome での受け入れ確認。smoke と同じシナリオをブラウザで通す | |
| `scripts/deploy.sh` 他 | AWS へのビルドと apply。手順は [docs/deploy.md](./docs/deploy.md) | |

## 前提

- Node.js 24 と pnpm 10。`.tool-versions` で固定
- Docker。PostgreSQL 16 をコンテナで起動する
- ブラウザは `*.localhost` を 127.0.0.1 に解決する。Chrome / Firefox / Safari はそのまま動く
- Node.js 24 も `*.localhost` をループバックに解決する。crm-web から api.crm.localhost を呼ぶためのホストファイル編集は不要

## セットアップ

```bash
pnpm install
pnpm db:up
```

各アプリの `.env.example` をコピーして `.env` を作る。ローカル検証用の値がそのまま入っている。

```bash
cp apps/auth-api/.env.example apps/auth-api/.env
cp apps/crm-web/.env.example apps/crm-web/.env
cp apps/crm-api/.env.example apps/crm-api/.env
cp apps/cms-web/.env.example apps/cms-web/.env
cp apps/cms-api/.env.example apps/cms-api/.env
```

サービスとホストに関わる環境変数は次のとおり。`*-web` と `*-api` は 1 プロセス 1 サービスで、担当するサービスを環境変数で与える。スキーマは `packages/service-web/src/config.ts` と `packages/service-api/src/config.ts` にあり、apps 側には設定コードを置かない。

| アプリ | 変数 | 内容 |
| --- | --- | --- |
| crm-web / cms-web | `CLIENT_ID` `CLIENT_SECRET` `SERVICE_NAME` | このプロセスが担当するサービス。oidc_clients と oidc_client_secrets の登録値と一致させる。`CLIENT_SECRET` は active な secret のいずれか |
| crm-web / cms-web | `BASE_HOST` `PUBLIC_SCHEME` | テナントのサブドメインを除いたホストと redirect_uri の scheme。`crm.localhost:3001` / `cms.localhost:3003`。Host `<tenant>.<BASE_HOST>` からテナント slug を決め、`<PUBLIC_SCHEME>://<host>/auth/callback` を redirect_uri にする。oidc_clients の `redirect_uri_template` を展開した値と一致する |
| crm-web / cms-web | `API_BASE_URL` | 呼び出す API の公開 URL。`http://api.crm.localhost:3002` / `http://api.cms.localhost:3004` |
| crm-api / cms-api | `API_BASE_URL` | この API の公開 URL。`http://api.crm.localhost:3002` / `http://api.cms.localhost:3004`。この値がそのまま aud になり、oidc_clients.audience と一致させる。Host が URL のホストと異なるリクエストは 404。`*-api` は `PUBLIC_SCHEME` を持たない |
| provision | `SERVICES` `PUBLIC_SCHEME` | 全サービスの `clientId` `clientSecret` `name` `baseHost` `apiBaseUrl` の JSON 配列。本番ホストで oidc_clients、`<PUBLIC_SCHEME>://{tenant}.<baseHost>/auth/callback` の redirect_uri_template、oidc_client_secrets を投入する |

## 起動

```bash
pnpm dev
```

auth-api / crm-web / crm-api / cms-web / cms-api の 5 アプリが同時に起動する。ブラウザで http://tanaka.crm.localhost:3001/projects を開く。

## ローカルのサービスとテナント

| サービス | id | client_id | client_secret | redirect_uri_template | API |
| --- | --- | --- | --- | --- | --- |
| CRM | `01J00000000000000000000CRM` | `crm` | `crm-secret` | `http://{tenant}.crm.localhost:3001/auth/callback` | http://api.crm.localhost:3002 |
| CMS | `01J00000000000000000000CMS` | `cms` | `cms-secret` | `http://{tenant}.cms.localhost:3003/auth/callback` | http://api.cms.localhost:3004 |

client_secret は `identity.oidc_client_secrets` に SHA-256 ハッシュで入っている。シードの行は `01J0000000000000000CRMSEC1` と `01J0000000000000000CMSSEC1`。サービスは active な secret を複数持てるため、新しい secret を追加してから `CLIENT_SECRET` を差し替え、最後に旧行を revoked にすれば無停止で切り替えられる。本番の client_secret は 32 バイト以上の乱数にする。

| テナント | id | 名前 | 契約サービス |
| --- | --- | --- | --- |
| tanaka | `01J00000000000000000TANAKA0` | Tanaka Inc. | crm、cms |
| suzuki | `01J00000000000000000SUZUKI0` | Suzuki Ltd. | crm |

テナントの追加は `identity.tenants` と `identity.tenant_services` に行を足すだけでよい。redirect_uri はテンプレートから導くため、テナントごとの登録はない。
suzuki.cms.localhost:3003 は cms のテンプレートに一致し suzuki も既知のテナントだが、契約がないため開いても `access_denied` になる。テンプレートに一致しない redirect_uri や、`nobody.crm.localhost:3001` のように tenants にない slug は `invalid_redirect_uri` でリダイレクトせず 400 になる。

## ローカルユーザー

Cognito はモックアダプタで代替している。`apps/auth-api/.env.example` の `MOCK_COGNITO_USERS` と `db/init/004_seed.sql` が対応する。

| ユーザー | パスワード | tanaka | suzuki |
| --- | --- | --- | --- |
| alice | alice-password | owner | viewer |
| bob | bob-password | 所属なし | admin |
| carol | carol-password | 所属なし | 所属なし |

Project のシードは tanaka に「Tanaka Project 1」「Tanaka Project 2」、suzuki に「Suzuki Project 1」がある。

確認できる挙動。

1. tanaka.crm に未ログインでアクセスすると auth.localhost のログイン画面へ遷移する
2. alice でログインすると tanaka の Projects が表示される。Cookie は tanaka.crm.localhost と auth.localhost にだけ発行される
3. そのまま suzuki.crm を開くとログイン画面なしで入れる。role は viewer になり Project 作成は拒否される
4. そのまま tanaka.cms を開くと、別サービスでもログイン画面なしで入れる。セッションは crm と別に作られ、Access Token の aud は cms の API になる
5. suzuki.cms を開くと 403 になり「テナント suzuki は CMS を契約していません」と表示される。SSO Session は残る
6. tanaka.crm でログアウトしても suzuki.crm と tanaka.cms はログイン済みのまま。tanaka.crm の Projects を開き直すと SSO Session によりパスワードなしで再ログインされる
7. ログアウト後の画面にある「Sandbox 全体からログアウト」を押すと auth.localhost の確認画面に移り、SSO Session とすべてのサービス・テナントのセッションが無効化される。完了画面には「CRM (tanaka) に戻る」のように戻り先のリンクが出る
8. bob で tanaka.crm を開くとアクセス権なしの画面になる。ログイン自体は成功しており suzuki.crm には入れる
9. carol はどのテナントにも所属していないため、どのホストを開いてもアクセス権なしになる
10. http://auth.localhost:3000/ を直接開くとポータルになる。未ログインならログインフォーム、ログイン後はテナントごとに role と契約サービスの一覧が出て、各サービスへパスワードなしで入れる

## Tenant Logout の挙動について

サービスの「ログアウト」はそのサービス × テナントのセッションだけを消し、auth.localhost の SSO Session は残す。仕様書 19.1 のとおり。
そのためログアウト直後にヘッダーの Projects を押すと、認可リクエストが auth に飛び、SSO Session によりログイン画面なしで再ログインされる。Google のサービスからログアウトしても Google アカウント自体はログインしたまま、という関係と同じ。
Sandbox 全体からログアウトしたい場合は、ログアウト後の画面やポータルにある「Sandbox 全体からログアウト」を使う。URL は `http://auth.localhost:3000/logout?client_id=crm&tenant=tanaka` の形で、戻り先の表示に使う。この挙動は 2026-09-09 に現状維持と決定した。

## アクセス拒否の理由

`/authorize` は user → tenant → 契約 → Membership の順に確認し、失敗すると `redirect_uri` へ `error=access_denied&error_description=<reason>` で戻す。`*-web` は 403 画面を出し、SSO Session は残る。Refresh 時も同じ確認を行う。

| reason | 意味 |
| --- | --- |
| `user_disabled` | users.status が active でない |
| `tenant_suspended` | tenants.status が active でない |
| `not_contracted` | tenant_services に契約がない。suzuki.cms がこれに当たる |
| `no_membership` | tenant_members に所属がない。bob の tanaka、carol の全テナントがこれに当たる |
| `membership_inactive` | tenant_members.status が active でない |

## ローカル運用の注意

- `REDIS_URL` 未設定のため SSO Session、認可リクエスト、Tenant Session はインメモリに保持している。`pnpm dev` を再起動するとすべて消えるため、再起動後はサービスの URL を開き直してログインする
- ログイン画面を開いたまま 30 分以上放置すると「ログイン画面を開いてから時間が経ちすぎた」旨のエラーになる。サービスの URL を開き直せばよい
- 署名鍵は起動ごとに生成される。再起動前に発行された Access Token は API Server で検証に失敗し、Tenant Session が破棄されて再ログインになる
- `*-api` は `API_BASE_URL` をそのまま aud にする。Host が `API_BASE_URL` のホストと異なるリクエストは 404、crm 向けの Access Token を api.cms.localhost:3004 に送ると 401 になる

## 検証

```bash
pnpm typecheck
pnpm lint
pnpm test
```

テストはサーバーを起動せずに Hono の `app.request()` で実行する。`packages/service-web/src/app.test.ts` は auth-api とサービスごとの web / api インスタンスをプロセス内で接続し、Cookie ジャー付きの簡易ブラウザでログインから別テナント SSO、別サービス SSO、未契約サービスの拒否、Logout までを通す。テストは 121 件。

起動中のサーバーと PostgreSQL に対する実 HTTP の確認は次で行う。tanaka.crm でのログイン、suzuki.crm と tanaka.cms への SSO、suzuki.cms の拒否、Tenant Logout、Global Logout を順に確認する。

```bash
pnpm smoke
```

実 Chrome で同じシナリオを通す場合は次を使う。

```bash
pnpm chrome-check
```

## AWS へのデプロイ

`terraform/` と `scripts/deploy.sh` で ECS Fargate に載せる。手順と構成は [docs/deploy.md](./docs/deploy.md) を参照する。ローカルとの差分は環境変数で切り替える。
AWS 側はまだテナントごとに Client を持つ旧構成のままで、サービス × テナントのホスト構成への移行は別作業とする。

| 項目 | ローカル | AWS |
| --- | --- | --- |
| Cognito | `COGNITO_ADAPTER=mock` | `COGNITO_ADAPTER=sdk`。USER_SRP_AUTH で実 User Pool に接続 |
| Session / Code Store | `REDIS_URL` 未設定でインメモリ | `REDIS_URL` で ElastiCache Redis |
| 署名鍵 | 起動ごとに生成 | `SIGNING_KEY_PEM` を Secrets Manager から注入 |
| Cookie | プレフィックスなし | `COOKIE_SECURE=true` で `__Host-` / `__Secure-` |
| client_secret | `CLIENT_SECRET` のローカル固定値。`crm-secret` / `cms-secret` | Terraform が 32 バイト以上の乱数を生成し Secrets Manager に保存。provision が oidc_client_secrets に active で upsert する |
| API の aud | `API_BASE_URL` の `http://api.crm.localhost:3002` / `http://api.cms.localhost:3004` | 同じ仕組みで `https://api.<service>.<domain>` |
| DB | docker compose の初期化 SQL | provision タスクがスキーマとシードを投入 |

## フェーズ2

- MFA チャレンジ。`/login/challenge`
- Refresh Token 系列の永続化と監視
- 管理 API と `admin` scope
