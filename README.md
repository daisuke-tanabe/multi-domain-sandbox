# multi-domain-sandbox

Cognito をユーザー認証基盤とし、auth.sandbox.com を独立した OpenID Provider として構築するマルチサービス・マルチテナント SSO 基盤の叩き台。
仕様と設計は [docs/](./docs/README.md)、実装規約は [ARCHITECTURE.md](./ARCHITECTURE.md) を参照する。

## モデル

- サービスは Auth Server を利用するプロダクト。OIDC Client 1 件に対応し、`client_id` はサービス ID。サンドボックスには `crm` と `cms` の 2 サービスがある
- テナントは顧客企業。サービスをまたいで共有される。サンドボックスには `tanaka` と `suzuki` の 2 テナントがある
- 契約は `identity.tenant_services` で表す。tanaka は crm と cms、suzuki は crm だけを契約している
- ホストは `<tenant>.<service>.<domain>`。本番なら tanaka.crm.com、suzuki.crm.com、tanaka.cms.com に相当する
- 認可リクエストのテナントは `client_id` と `redirect_uri` の組で決まる。redirect_uri はテナント×サービスごとに登録する

## 他リポジトリへの導入

既存サービスへ同じ仕組みを入れるための自己完結ガイドを [docs/integration-guide.md](./docs/integration-guide.md) に置いている。仕様、全 URL とパラメータの詳細設計、誰が何を渡して何を受け取るかを書いたシーケンス図、サブドメインに依存せず別ドメインでも動く理由、Next.js 構成への読み替え、参考資料をまとめてある。導入先のリポジトリへはこのファイルをそのままコピーして使う。

## 構成

| ディレクトリ | 役割 | ローカルホスト |
| --- | --- | --- |
| `apps/auth-server` | OpenID Provider。ログイン画面、認可、Token 発行、SSO Session、ポータル | http://auth.localhost:3000 |
| `apps/tenant-web` | Tenant Web Application。BFF。1 プロセスで複数サービス × 複数テナントのホストを受ける | http://tanaka.crm.localhost:3001 / http://suzuki.crm.localhost:3001 / http://tanaka.cms.localhost:3001 / http://suzuki.cms.localhost:3001 |
| `apps/api-server` | Resource Server。Bearer 検証、Membership 認可、RLS。1 プロセスでサービスごとの API ホストを受ける | http://api.crm.localhost:3002 / http://api.cms.localhost:3002 |
| `packages/shared` | Result 型、KV ストア、PKCE、AES-GCM、scrypt、JWT、Cookie、ロガー | |
| `packages/oidc-client` | Tenant Web Application 向け OIDC Client 共通モジュール | |
| `db/init` | PostgreSQL のロール、スキーマ、RLS、シード | |
| `apps/provision` | RDS のスキーマ作成、Cognito テストユーザー作成、シード投入。ECS の一回限りタスク | |
| `terraform` | AWS 構成。ECS Fargate + ALB、RDS、ElastiCache、Cognito、Route 53、ACM | |
| `scripts/smoke.ts` | 起動中のサーバーに対する実 HTTP の疎通確認。別サービスへの SSO と未契約サービスの拒否まで確認する | |
| `scripts/chrome-check.ts` | 実 Chrome での受け入れ確認。smoke と同じシナリオをブラウザで通す | |
| `scripts/deploy.sh` 他 | AWS へのビルドと apply。手順は [docs/deploy.md](./docs/deploy.md) | |

## 前提

- Node.js 24 と pnpm 10。`.tool-versions` で固定
- Docker。PostgreSQL 16 をコンテナで起動する
- ブラウザは `*.localhost` を 127.0.0.1 に解決する。Chrome / Firefox / Safari はそのまま動く
- Node.js 24 も `*.localhost` をループバックに解決する。tenant-web から api.crm.localhost を呼ぶためのホストファイル編集は不要

## セットアップ

```bash
pnpm install
pnpm db:up
```

各アプリの `.env.example` をコピーして `.env` を作る。ローカル検証用の値がそのまま入っている。

```bash
cp apps/auth-server/.env.example apps/auth-server/.env
cp apps/tenant-web/.env.example apps/tenant-web/.env
cp apps/api-server/.env.example apps/api-server/.env
```

サービスとホストに関わる環境変数は次のとおり。

| アプリ | 変数 | 内容 |
| --- | --- | --- |
| tenant-web | `SERVICES` | サービスごとの `clientId` `clientSecret` `name` `baseHost` `apiBaseUrl` の JSON 配列。Host `<tenant>.<baseHost>` からサービスとテナント slug を決め、`<scheme>://<host>/auth/callback` を redirect_uri にする |
| api-server | `API_HOSTS` | 受け付ける API ホストのカンマ区切り。`api.crm.localhost:3002,api.cms.localhost:3002` |
| api-server | `PUBLIC_SCHEME` | aud を `<PUBLIC_SCHEME>://<host>` として組み立てる |
| provision | `SERVICES` | tenant-web と同じ形式。本番ホストで oidc_clients と redirect_uri を投入する |

## 起動

```bash
pnpm dev
```

3 アプリが同時に起動する。ブラウザで http://tanaka.crm.localhost:3001/projects を開く。

## ローカルのサービスとテナント

| サービス | client_id | client_secret | ホスト | API |
| --- | --- | --- | --- | --- |
| CRM | `crm` | `crm-secret` | `<tenant>.crm.localhost:3001` | http://api.crm.localhost:3002 |
| CMS | `cms` | `cms-secret` | `<tenant>.cms.localhost:3001` | http://api.cms.localhost:3002 |

| テナント | 名前 | 契約サービス |
| --- | --- | --- |
| tanaka | Tanaka Inc. | crm、cms |
| suzuki | Suzuki Ltd. | crm |

suzuki.cms.localhost:3001 の redirect_uri は登録済みだが契約がないため、開いても `access_denied` になる。

## ローカルユーザー

Cognito はモックアダプタで代替している。`apps/auth-server/.env.example` の `MOCK_COGNITO_USERS` と `db/init/004_seed.sql` が対応する。

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

`/authorize` は user → tenant → 契約 → Membership の順に確認し、失敗すると `redirect_uri` へ `error=access_denied&error_description=<reason>` で戻す。tenant-web は 403 画面を出し、SSO Session は残る。Refresh 時も同じ確認を行う。

| reason | 意味 |
| --- | --- |
| `user_disabled` | users.status が active でない |
| `tenant_suspended` | tenants.status が active でない |
| `not_contracted` | tenant_services に契約がない。suzuki.cms がこれに当たる |
| `no_membership` | tenant_members に所属がない。bob の tanaka、carol の全テナントがこれに当たる |
| `membership_inactive` | tenant_members.status が active でない |

## ローカル運用の注意

- SSO Session、認可リクエスト、Tenant Session はインメモリに保持している。`pnpm dev` を再起動するとすべて消えるため、再起動後はサービスの URL を開き直してログインする
- ログイン画面を開いたまま 30 分以上放置すると「ログイン画面を開いてから時間が経ちすぎた」旨のエラーになる。サービスの URL を開き直せばよい
- 署名鍵は起動ごとに生成される。再起動前に発行された Access Token は API Server で検証に失敗し、Tenant Session が破棄されて再ログインになる
- api-server は Host ヘッダから aud を決める。`API_HOSTS` にないホストは 404、crm 向けの Access Token を api.cms.localhost に送ると 401 になる

## 検証

```bash
pnpm typecheck
pnpm lint
pnpm test
```

テストはサーバーを起動せずに Hono の `app.request()` で実行する。tenant-web のテストは auth-server / api-server をプロセス内で接続し、Cookie ジャー付きの簡易ブラウザでログインから別テナント SSO、別サービス SSO、未契約サービスの拒否、Logout までを通す。テストは 112 件。

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
| client_secret | `SERVICES` のローカル固定値。`crm-secret` / `cms-secret` | Terraform が生成し Secrets Manager に保存 |
| API の aud | `API_HOSTS` と `PUBLIC_SCHEME` から `http://api.<service>.localhost:3002` | 同じ仕組みで `https://api.<service>.<domain>` |
| DB | docker compose の初期化 SQL | provision タスクがスキーマとシードを投入 |

## フェーズ2

- MFA チャレンジ。`/login/challenge`
- Refresh Token 系列の永続化と監視
- 管理 API と `admin` scope
