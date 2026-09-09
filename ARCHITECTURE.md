# ARCHITECTURE.md

## このファイルの目的

技術設計・実装規約。機能実装・データモデル変更・キャッシュ・インフラ関連の作業では必ず本ファイルに従う。
認証アーキテクチャの詳細は `docs/design/` を正とする。本ファイルは実装レベルの規約を定める。

## リポジトリ構成

pnpm workspace のモノレポ。

```text
apps/auth-server      auth.sandbox.com。OpenID Provider
apps/tenant-web       tenant-*.sandbox.com。BFF。1プロセスで複数テナントのホストを受ける
apps/api-server       api.sandbox.com。Resource Server
packages/shared       Result 型、ストア抽象、暗号、JWT、Cookie、ロガー
packages/oidc-client  Tenant Web Application 向け OIDC Client 共通モジュール
db/                   PostgreSQL の初期化 SQL とシード
docs/                 仕様と設計
```

## 技術スタック

| 項目 | 採用 | 備考 |
| --- | --- | --- |
| ランタイム | Node.js 24 | `.tool-versions` で固定 |
| 言語 | TypeScript。strict | `tsc --noEmit` で型検査。ビルドは tsx で直接実行 |
| HTTP | Hono + @hono/node-server | 3アプリ共通 |
| バリデーション | zod + @hono/zod-validator | システム境界の入力は必ずスキーマで検証する |
| JWT / JWKS | jose | 自前実装禁止 |
| DB | PostgreSQL 16 on Docker。pg ドライバで素の SQL | ORM は使わない |
| Session / Code Store | `KeyValueStore` インターフェース。ローカルはインメモリ | Redis 実装は同じインターフェースで差し替える |
| Cognito | `CognitoAuthenticator` インターフェース。ローカルはモック | 本番アダプタは雛形のみ |
| テスト | Vitest | `app.request()` でサーバー起動なしに検証 |
| Lint / Format | oxlint / oxfmt | PostToolUse hook で自動適用 |

## ローカルのホスト構成

ブラウザは `*.localhost` を 127.0.0.1 に解決する。Cookie の分離をローカルでも再現するため、ホスト名で分ける。

| ホスト | ポート | アプリ |
| --- | --- | --- |
| auth.localhost | 3000 | auth-server |
| tenant-a.localhost / tenant-b.localhost | 3001 | tenant-web |
| api.localhost | 3002 | api-server |

サーバー間通信は DNS に依存しないよう `127.0.0.1:<port>` を内部 URL として設定し、公開 URL とは別に持つ。

## レイヤー規約

各アプリは Ports & Adapters で構成する。

```text
src/
  main.ts            起動。設定読み込みと依存の組み立て
  app.ts             Hono アプリの組み立て。テストから import する
  config.ts          環境変数の検証と型付き設定
  routes/            HTTP ハンドラ。入力検証と応答のみ
  usecases/          業務ロジック。Result を返す
  ports/             インターフェース。ストア、リポジトリ、外部サービス
  adapters/          ports の実装。memory / pg / mock-cognito
```

- routes は ports を直接呼ばず usecases を呼ぶ
- usecases は adapters を import しない。ports だけに依存する
- main.ts でのみ adapters を組み立てる

## エラー規約

- 回復可能な失敗は `Result<T, E>` で返す。`E` は判別ユニオンの `kind` を持つ
- OAuth エラーは RFC 6749 のエラーコードを `kind` にそのまま使う
- ユーザー向け文言は routes で決める。usecases は理由コードだけ返す
- 秘密値をログに出さない。ロガーは許可リストのフィールドのみ出力する

## セキュリティ規約

- Cookie は `docs/design/03-cookie-design.md` に従う。本番は `__Host-` 必須
- Token は `docs/design/04-token-design.md` に従う。ブラウザへ渡さない
- redirect_uri は完全一致。不一致時はリダイレクトしない
- API の tenant_id は Access Token 由来のみ。リクエストの値を認可に使わない
- Repository は tenant_id を必須引数に取る

## 環境変数

- 各アプリは `.env.example` を持つ。`.env` は git 管理外
- 起動時に zod で検証し、不足があれば起動を失敗させる
- 開発時の既定値はコード側に持たせず `.env.example` に書く

## 命名

- ファイルは kebab-case。型は PascalCase。関数と変数は camelCase
- テストは対象ファイルと同じディレクトリに `*.test.ts`
- 真偽値に否定形を使わない
