# multi-domain-sandbox

Cognito をユーザー認証基盤とし、auth.sandbox.com を独立した OpenID Provider として構築するマルチテナント SSO 基盤の叩き台。
仕様と設計は [docs/](./docs/README.md)、実装規約は [ARCHITECTURE.md](./ARCHITECTURE.md) を参照する。

## 構成

| ディレクトリ | 役割 | ローカルホスト |
| --- | --- | --- |
| `apps/auth-server` | OpenID Provider。ログイン画面、認可、Token 発行、SSO Session | http://auth.localhost:3000 |
| `apps/tenant-web` | Tenant Web Application。BFF。1 プロセスで複数テナントのホストを受ける | http://tenant-a.localhost:3001 / http://tenant-b.localhost:3001 |
| `apps/api-server` | Resource Server。Bearer 検証、Membership 認可、RLS | http://api.localhost:3002 |
| `packages/shared` | Result 型、KV ストア、PKCE、AES-GCM、scrypt、JWT、Cookie、ロガー | |
| `packages/oidc-client` | Tenant Web Application 向け OIDC Client 共通モジュール | |
| `db/init` | PostgreSQL のロール、スキーマ、RLS、シード | |
| `scripts/smoke.ts` | 起動中のサーバーに対する実 HTTP の疎通確認 | |

## 前提

- Node.js 24 と pnpm 10。`.tool-versions` で固定
- Docker。PostgreSQL 16 をコンテナで起動する
- ブラウザは `*.localhost` を 127.0.0.1 に解決する。Chrome / Firefox / Safari はそのまま動く

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

## 起動

```bash
pnpm dev
```

3 アプリが同時に起動する。ブラウザで http://tenant-a.localhost:3001/projects を開く。

## ローカルユーザー

Cognito はモックアダプタで代替している。`apps/auth-server/.env.example` の `MOCK_COGNITO_USERS` と `db/init/004_seed.sql` が対応する。

| ユーザー | パスワード | tenant-a | tenant-b |
| --- | --- | --- | --- |
| alice | alice-password | owner | viewer |
| bob | bob-password | 所属なし | admin |
| carol | carol-password | 所属なし | 所属なし |

確認できる挙動。

1. tenant-a に未ログインでアクセスすると auth.localhost のログイン画面へ遷移する
2. alice でログインすると tenant-a の Projects が表示される。Cookie は tenant-a.localhost と auth.localhost にだけ発行される
3. そのまま tenant-b を開くとログイン画面なしで入れる。role は viewer になり Project 作成は拒否される
4. tenant-a でログアウトしても tenant-b はログイン済みのまま
5. bob で tenant-a を開くとアクセス権なしの画面になる。ログイン自体は成功しており tenant-b には入れる

## ローカル運用の注意

- SSO Session、認可リクエスト、Tenant Session はインメモリに保持している。`pnpm dev` を再起動するとすべて消えるため、再起動後はテナントの URL を開き直してログインする
- ログイン画面を開いたまま 30 分以上放置すると「ログイン画面を開いてから時間が経ちすぎた」旨のエラーになる。テナントの URL を開き直せばよい
- 署名鍵は起動ごとに生成される。再起動前に発行された Access Token は API Server で検証に失敗し、Tenant Session が破棄されて再ログインになる

## 検証

```bash
pnpm typecheck
pnpm lint
pnpm test
```

テストはサーバーを起動せずに Hono の `app.request()` で実行する。tenant-web のテストは auth-server / api-server をプロセス内で接続し、Cookie ジャー付きの簡易ブラウザでログインから SSO、Logout までを通す。

起動中のサーバーと PostgreSQL に対する実 HTTP の確認は次で行う。

```bash
pnpm smoke
```

## 本番へ持ち出すときに差し替えるもの

| 項目 | 検証実装 | 本番 |
| --- | --- | --- |
| Cognito | `MockCognitoAuthenticator` | `SdkCognitoAuthenticator`。雛形のみ。USER_SRP_AUTH を実装する |
| Session / Code Store | `MemoryKeyValueStore` | Redis 実装。`KeyValueStore` を実装する |
| 署名鍵 | 起動ごとに生成 | `SIGNING_KEY_PEM` を Secret Store から注入 |
| Cookie | プレフィックスなし | `COOKIE_SECURE=true` で `__Host-` / `__Secure-` を付ける |
| client_secret | `.env` の固定値 | Secret Store。slug をキーに取得 |
| DB ロール | 固定パスワード | Secret Store |

## フェーズ2

- MFA チャレンジ。`/login/challenge`
- Global Logout。`/logout` と Back-Channel Logout
- Refresh Token 系列の永続化と監視
- 管理 API と `admin` scope
