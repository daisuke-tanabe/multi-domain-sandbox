# ARCHITECTURE.md

## このファイルの目的

技術設計・実装規約。機能実装・データモデル変更・キャッシュ・インフラ関連の作業では必ず本ファイルに従う。
認証アーキテクチャの詳細は `docs/design/` を正とする。本ファイルは実装レベルの規約を定める。

## リポジトリ構成

pnpm workspace のモノレポ。

```text
apps/auth-api         auth.sandbox.com。OpenID Provider。ログイン画面とポータルも当面ここが返す
apps/crm-web          <tenant>.crm.sandbox.com。CRM の Web。BFF として Cookie セッションと API 中継を持つ
apps/crm-api          api.crm.sandbox.com。CRM の Resource Server
apps/cms-web          <tenant>.cms.sandbox.com。CMS の Web。crm-web と同じ構成
apps/cms-api          api.cms.sandbox.com。CMS の Resource Server
packages/shared       Result 型、ストア抽象と StoreFactory、暗号、JWT / JWKS 取得、Cookie、ロガー、環境変数、pg、識別子の enum、セッション期限
packages/oidc-client  *-web 向け OIDC Client 共通モジュール。/auth/* とセッション
packages/web-core     apps/*-web の実装本体。crm-web と cms-web はこれを起動するだけ。BFF として画面、/auth/* の受け口、API 中継、設定スキーマを持つ
packages/api-core     apps/*-api の実装本体。crm-api と cms-api はこれを起動するだけ。auth-api は使わない。Token 検証、Membership 認可、routes、adapters、設定スキーマを持つ
tools/provision       AWS 専用。RDS のスキーマ作成、Cognito テストユーザー作成、シード投入
db/                   PostgreSQL の初期化 SQL とシード
docs/                 仕様と設計
```

apps/crm-web / cms-web / crm-api / cms-api はエントリポイントだけを持つ。`main.ts` は `startWebCore("crm-web")` や `startApiCore("crm-api")` を呼ぶ 2 行で、設定スキーマと依存の組み立ては `packages/web-core/src/config.ts` `start.ts` と `packages/api-core/src/config.ts` `start.ts` にある。
サービスごとに web と api を 1 プロセスずつ動かし、実装は packages に置いて共有する。
サービスを増やすときは apps に web と api を 1 組追加し、`.env` でサービス固有の値を渡す。
`*-web` はクライアントを意味する。ただし Token と Cookie をブラウザへ出さない BFF 方式のため、画面の配信と `/auth/*`、API 中継を担う薄いサーバーは必ず残す。

## 技術スタック

| 項目 | 採用 | 備考 |
| --- | --- | --- |
| ランタイム | Node.js 24 | `.tool-versions` で固定 |
| 言語 | TypeScript。strict | `tsc --noEmit` で型検査。ビルドは tsx で直接実行 |
| HTTP | Hono + @hono/node-server | 全アプリ共通 |
| バリデーション | zod + @hono/zod-validator | システム境界の入力は必ずスキーマで検証する |
| JWT / JWKS | jose | 自前実装禁止 |
| DB | PostgreSQL 16 on Docker。pg ドライバで素の SQL | ORM は使わない |
| Session / Code Store | `KeyValueStore` インターフェース。ローカルはインメモリ | `createStoreFactory` が `REDIS_URL` の有無で Redis とインメモリを切り替える。auth-api と `*-web` で共通 |
| Cognito | `CognitoAuthenticator` インターフェース。ローカルはモック | 本番アダプタは雛形のみ |
| テスト | Vitest | `app.request()` でサーバー起動なしに検証 |
| Lint / Format | oxlint / oxfmt | PostToolUse hook で自動適用 |

## ローカルのホスト構成

ブラウザは `*.localhost` を 127.0.0.1 に解決する。Cookie の分離をローカルでも再現するため、ホスト名で分ける。

| ホスト | ポート | アプリ |
| --- | --- | --- |
| auth.localhost | 3000 | auth-api |
| tanaka.crm.localhost / suzuki.crm.localhost | 3001 | crm-web |
| api.crm.localhost | 3002 | crm-api |
| tanaka.cms.localhost / suzuki.cms.localhost | 3003 | cms-web |
| api.cms.localhost | 3004 | cms-api |

Auth への サーバー間通信は DNS に依存しないよう `127.0.0.1:3000` を内部 URL として設定し、公開 URL とは別に持つ。
web から api への呼び出しは公開 URL をそのまま使う。api は aud を `API_BASE_URL` に固定し、Host がそのホストと違えば 404 にするため、ホスト名を変えて呼んではならない。

## レイヤー規約

各アプリは Ports & Adapters で構成する。

```text
src/
  main.ts            起動。設定読み込みと依存の組み立て。packages では start.ts が担い、apps の main.ts はそれを呼ぶだけ
  app.ts             Hono アプリの組み立て。テストから import する
  config.ts          環境変数の検証と型付き設定
  routes/            HTTP ハンドラ。入力検証と応答のみ
  usecases/          業務ロジック。Result を返す
  ports/             インターフェース。ストア、リポジトリ、外部サービス
  adapters/          ports の実装。memory / pg / mock-cognito
```

- routes は ports を直接呼ばず usecases を呼ぶ
- usecases は adapters を import しない。ports だけに依存する
- main.ts と start.ts でのみ adapters を組み立てる
- `*-api` の認証は `usecases/resolve-tenant-context.ts` に置く。Host 確認、Bearer 検証、user / tenant / membership の取得と判定までを usecase が行い、`auth/middleware.ts` はその Result を HTTP ステータスに写像するだけにする

## エラー規約

- 回復可能な失敗は `Result<T, E>` で返す。`E` は判別ユニオンの `kind` を持つ
- OAuth エラーは RFC 6749 のエラーコードを `kind` にそのまま使う
- ユーザー向け文言は routes で決める。usecases は理由コードだけ返す
- 秘密値をログに出さない。ロガーは許可リストのフィールドのみ出力する

## セキュリティ規約

- Cookie は `docs/design/03-cookie-design.md` に従う。本番は `__Host-` 必須
- Token は `docs/design/04-token-design.md` に従う。ブラウザへ渡さない
- redirect_uri は完全一致。不一致時はリダイレクトしない。登録はサービスごとの `redirect_uri_template` で行い、`{tenant}` をテナント slug で展開した文字列と比較する
- client_secret はサービスごとに複数持てる。ローテーションは新 secret を追加してから旧 secret を revoked にする。`CLIENT_SECRET` と provision の `clientSecret` は 43 文字以上をスキーマで要求する
- 一覧は `SetStore`、一回限りの消費は `getAndDelete`、Refresh はセッション単位のロック。値を読んで書き戻す形の一覧更新や、読んでから消す二段階の消費は書かない
- ブラウザと Client のサーバーから受ける入力はレート制限と body 上限を通す。制限値は `docs/design/08-security-design.md` に従う
- API の tenant_id は Access Token 由来のみ。リクエストの値を認可に使わない
- サービスへのログイン可否は tenant_service_members、細かい権限はサービス側 DB の member_permissions で判定し Token に載せない。`/authorize` と Refresh は user → tenant → 契約 → このサービスへの割り当ての順に確認し、API は Token の tenant_id と client_id で割り当てを毎リクエスト再検証する。tenant_members は会社横断の役割で、ログイン可否には使わない
- 権限の確定は役割の既定 ∪ allow − deny。deny が優先し、未知の permission 名は無視する。`requirePermission` は確定した集合で判定し、Token の role や permissions claim は無視する
- Repository は tenant_id を必須引数に取る

## DB 規約

- 主キーはサロゲート ID。ULID を TEXT で保存する。`client_id` や `slug` のような公開識別子は UNIQUE 制約で守り、外部キーには使わない
- 関連テーブルの主キーは参照するサロゲート ID の組にする。tenant_services は `(tenant_id, oidc_client_id)`、tenant_service_members は `(tenant_id, oidc_client_id, user_id)`
- 契約に従属する表は契約への複合外部キーを持つ。tenant_service_members は `(tenant_id, oidc_client_id)` で tenant_services を参照し、契約のないサービスに人を割り当てられない形にする
- サービス固有の権限は Identity DB に置かず、そのサービスの business スキーマに置く。business の表はすべて tenant_id を持ち、RLS を ENABLE と FORCE で有効にする。サンドボックスは 1 DB を複数サービスで共有するため member_permissions に client_id を持つ
- 外部キーの逆引きにはインデックスを張る
- `updated_at` はトリガーで更新する。アプリ側で更新しない

## 環境変数

- 各アプリは `.env.example` を持つ。`.env` は git 管理外
- 起動時に zod で検証し、不足があれば起動を失敗させる。検証は `packages/shared` の `parseEnv` に zod スキーマを渡して行い、`envBoolean` `jsonArrayEnv` `publicSchemeEnv` を再利用する
- 開発時の既定値はコード側に持たせず `.env.example` に書く
- Cookie の Secure と `__Host-` は公開 scheme から導く。auth-api は `ISSUER`、`*-web` は `PUBLIC_SCHEME`。切り替え用の変数を追加しない
- https のときは本番の値を必須にする。auth-api は `SIGNING_KEY_PEM` `REDIS_URL` `COGNITO_ADAPTER=sdk`、`*-web` は `REDIS_URL` と https の `ISSUER` / `API_BASE_URL`。欠けたら起動を失敗させる

## 命名

- ファイルは kebab-case。型は PascalCase。関数と変数は camelCase
- テストは対象ファイルと同じディレクトリに `*.test.ts`
- 真偽値に否定形を使わない
- 比較は `===` を使う。null と undefined をまとめて判定するときだけ `== null` を許す。oxlint の eqeqeq で強制する
