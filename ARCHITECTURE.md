# ARCHITECTURE.md

## このファイルの目的

技術設計・実装規約。機能実装・データモデル変更・キャッシュ・インフラ関連の作業では必ず本ファイルに従う。
認証アーキテクチャの詳細は `docs/design/` を正とする。本ファイルは実装レベルの規約を定める。

## リポジトリ構成

pnpm workspace のモノレポ。

```text
apps/auth-api         auth.sandbox.com。OpenID Provider。ログイン画面とポータルも当面ここが返す
apps/crm-web          <tenant>.crm.sandbox.com。CRM の Web。React Router の SPA と、それを配る薄い BFF。src/main.ts が BFF を起動し、app/ に画面
apps/crm-api          api.crm.sandbox.com。CRM の Resource Server。definition.ts に役割と権限、end-users/ にエンドユーザーの routes と repository
apps/cms-web          <tenant>.cms.sandbox.com。CMS の Web。crm-web と同じ構成
apps/cms-api          api.cms.sandbox.com。CMS の Resource Server。definition.ts に役割と権限、posts/ に投稿の routes と repository
packages/shared       Result 型、ストア抽象と StoreFactory、暗号、JWT / JWKS 取得、Cookie、ロガー、環境変数、pg、識別子の enum、セッション期限
packages/oidc-client  *-web 向け OIDC Client 共通モジュール。/auth/* とセッション
packages/web-core     apps/*-web の BFF 本体。/auth/* の受け口、/session、/api/* の中継、SPA の配信、エラー画面、設定スキーマ、起動関数を持つ
packages/web-ui       apps/*-web が共有する React コード。BFF との通信、ルートの clientLoader、共通の枠、管理アカウント画面、スタイル
packages/api-core     apps/*-api のフレームワーク。auth-api は使わない。ServiceDefinition、Token 検証、member 解決と権限の確定、/v1/me と /v1/members、MemberRepository、AuthAdminClient、withTenant、設定スキーマ、起動関数を持つ
tools/provision       AWS 専用。identity DB のスキーマ作成、Cognito テストユーザー作成、シード投入。サービスの DB は扱わない
db/identity, db/crm, db/cms  各 DB の初期化 SQL とシード。DB はサービスごとに分かれ、コンテナも分かれる
docs/                 仕様と設計
```

apps/crm-web / cms-web は BFF の起動口と、そのサービスの画面だけを持つ。

```text
apps/crm-web/
  src/main.ts             startWebCore("crm-web") を呼ぶだけ。設定スキーマと依存の組み立ては packages/web-core/src/config.ts と start.ts
  app/root.tsx            Layout、clientLoader = loadShell、HydrateFallback、ErrorBoundary
  app/routes.ts           ルート定義
  app/routes/home.tsx     ホーム。役割と権限の表
  app/routes/end-users.tsx  CRM 固有の画面。cms-web は posts.tsx
  app/routes/members.tsx  packages/web-ui の MembersPage を置くだけ
  react-router.config.ts  ssr: false、appDirectory app、buildDirectory build
  vite.config.ts          reactRouter プラグイン。127.0.0.1:5173 で待ち受け、cms-web は 5174
  tsconfig.json           src 用
  tsconfig.app.json       app 用。bundler 解決、react-jsx、.react-router/types
```

apps/crm-api / cms-api は `definition.ts` でサービスの役割と権限を `defineService` で宣言し、サービス固有の routes と repository を持つ。`main.ts` は定義、スキーマ名、routes を `startApiCore` に渡す。Token 検証、member 行の解決、権限の確定、`/v1/me`、管理アカウントの `/v1/members` は `packages/api-core` が提供し、apps 側には書かない。
サービスごとに web と api を 1 プロセスずつ動かし、共通の実装は packages に置いて共有する。
サービスを増やすときは apps に web と api を 1 組追加し、web 側に `app/` の routes とサービス固有の画面、api 側に `definition.ts` と routes を書き、`db/<service>/init` に members と permission_overrides を含む DB を用意し、`.env` でサービス固有の値を渡す。
`*-web` はクライアントを意味する。ただし Token と Cookie をブラウザへ出さない BFF 方式のため、SPA の配信と `/auth/*`、`/session`、`/api/*` の中継を担う薄いサーバーは必ず残す。

## 技術スタック

| 項目 | 採用 | 備考 |
| --- | --- | --- |
| ランタイム | Node.js 24 | `.tool-versions` で固定 |
| 言語 | TypeScript。strict | `tsc --noEmit` で型検査。サーバーは tsx で直接実行 |
| HTTP | Hono + @hono/node-server | 全アプリ共通 |
| 画面 | React Router v8 の SPA モード。ビルドは Vite | `apps/*-web/app` に置き、`react-router build` の `build/client` を BFF が配る。共通の React コードは `packages/web-ui` |
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
| 127.0.0.1 | 5173 / 5174 | crm-web / cms-web の `react-router dev`。開発時だけ BFF が中継する |

Auth への サーバー間通信は DNS に依存しないよう `127.0.0.1:3000` を内部 URL として設定し、公開 URL とは別に持つ。
web から api への呼び出しは公開 URL をそのまま使う。api は aud を `API_BASE_URL` に固定し、Host がそのホストと違えば 404 にするため、ホスト名を変えて呼んではならない。
ブラウザは Vite のポートを直接開かない。テナントのホストで BFF を開き、BFF が Vite へ中継する。HMR の WebSocket だけはブラウザから Vite へ直接つなぐ。

## SPA と BFF の契約

`*-web` の画面は React Router v8 の SPA モードで描き、`packages/web-core` の BFF は次だけを担う。

| 経路 | 内容 |
| --- | --- |
| `/auth/*` | `packages/oidc-client` のログイン、コールバック、ログアウト、Back-Channel Logout。ログアウト後は `/?logged_out=1` へ戻す |
| `GET /session` | SPA に渡すログイン状態。`service` `tenant` `urls` `authenticated` と、ログイン済みなら `user` と `csrfToken`。Token は返さない |
| `ALL /api/*` | サービスの API への中継。`API_BASE_URL` に `/api` を除いたパスを付け、サーバー側の Access Token を Bearer で付ける |
| それ以外の GET | SPA の配信。`SPA_DIR` があれば静的配信、`SPA_DEV_SERVER_URL` があれば Vite へ中継 |

- SPA は Token を見ない。Cookie 付きの同一オリジン fetch だけを行い、API は必ず `/api/*` 経由で呼ぶ。`API_BASE_URL` をブラウザに渡さない
- `/api/*` はセッションがなければ 401 `unauthenticated`。GET / HEAD / OPTIONS 以外は `X-CSRF-Token` ヘッダが `/session` の `csrfToken` と一致しなければ 403。body は JSON のみ受け付け、それ以外は 415。上限は 64 KB。API がセッション切れを返したら 401 にし、SPA が `/auth/login?return_to=<現在のパス>` へ遷移して再ログインする
- ルートの `clientLoader` は `packages/web-ui` の `loadShell` を使う。`/session` を読み、未ログインなら `/auth/login` へ送り、ログイン済みなら `/v1/me` を読んで `useShell` と `usePermissions` に渡す。`?logged_out=1` のときだけログアウト済み画面を出す
- 共通の React コードは `packages/web-ui` に置く。BFF との通信 `api.ts`、枠と loader の `shell.tsx`、両サービス共通の `members-page.tsx`、`styles.css`。`apps/*-web/app` には routes とサービス固有の画面だけを置き、通信や CSRF の扱いを書かない
- 画面の出し分けは `/v1/me` の `permissions` で行う。ナビゲーションは `permission` を持つ項目を確定した権限で絞り、ボタンは該当する permission がなければ出さない。最終判定は API が行う
- 静的配信では CSP の `script-src` を `'self'` と `index.html` のインラインスクリプトの sha256 ハッシュに限定し、`'unsafe-inline'` を使わない。`/assets/*` は immutable で長期キャッシュし、それ以外の GET は `index.html` を返す
- Vite への中継は開発専用。`'unsafe-inline'` と Vite の origin および ws origin への `connect-src` を許すため、`PUBLIC_SCHEME=https` では `SPA_DIR` を必須にして中継モードで起動できないようにする
- `SPA_DIR` も `SPA_DEV_SERVER_URL` もなければ最小の HTML だけを返し警告を出す。テストはこのモードで `/auth/*` `/session` `/api/*` を検証する
- 不明なホストの 400 や未契約の 403 のように、SPA へ渡す前に起きるエラーは `packages/web-core/src/views` のサーバー側 HTML で返す。それ以外の画面をサーバー側で描かない

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
- `*-api` の認証は `packages/api-core/src/usecases/resolve-tenant-context.ts` に置く。Host 確認、Bearer 検証、自サービス DB の member 行の取得と JIT 作成、上書きの適用による権限の確定までを usecase が行い、`auth/middleware.ts` はその Result を HTTP ステータスに写像するだけにする。identity DB は参照しない
- `*-api` のサービス固有ルートは `apps/<service>-api/src/<resource>/routes.ts` と `repository.ts` に置く。routes は `requirePermission` で要求 permission を宣言し、repository は `withTenant` で `app.tenant_id` を設定したトランザクションの中で SQL を実行する
- `*-web` の画面は `apps/<service>-web/app/routes/` に置き、BFF との通信は `packages/web-ui` の `api` と `loadShell` を経由する。画面から `fetch` を直接呼ばない

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
- サービスへのログイン可否は tenant_service_members、役割と細かい権限はサービス側 DB の members と permission_overrides で判定し Token に載せない。`/authorize` と Refresh は user → tenant → 契約 → このサービスへの割り当ての順に確認し、API は Token の tenant_id と sub で自サービス DB の member 行を毎リクエスト読む。tenant_members は会社横断の役割で、ログイン可否には使わない
- auth-api の管理 API `/admin/service-members` は client_secret_basic で認証し、呼び出した Client 自身のサービスへの割り当てだけを操作させる。`/token` と同じレート制限を通す
- 権限の確定は役割の既定 ∪ allow − deny。deny が優先し、未知の permission 名は無視する。`requirePermission` は確定した集合で判定し、Token の role や permissions claim は無視する
- Repository は tenant_id を必須引数に取る

## DB 規約

- 主キーはサロゲート ID。ULID を TEXT で保存する。`client_id` や `slug` のような公開識別子は UNIQUE 制約で守り、外部キーには使わない
- 関連テーブルの主キーは参照するサロゲート ID の組にする。tenant_services は `(tenant_id, oidc_client_id)`、tenant_service_members は `(tenant_id, oidc_client_id, user_id)`
- 契約に従属する表は契約への複合外部キーを持つ。tenant_service_members は `(tenant_id, oidc_client_id)` で tenant_services を参照し、契約のないサービスに人を割り当てられない形にする
- DB はサービスごとに分ける。identity DB は auth-api だけが接続し、crm-api は crm DB、cms-api は cms DB にしか接続しない。識別子の共有は user_id と tenant_id の値だけで、DB 間の外部キーや JOIN はない
- identity が持つのは「誰がどのテナントのどのサービスに入れるか」まで。役割と細かい権限はサービスの DB の members と permission_overrides に置き、Token には載せない。役割の語彙はサービスごとに定義する
- サービスの DB の表はすべて tenant_id を持ち、RLS を ENABLE と FORCE で有効にする。表の所有者はアプリのロールと分け、アプリのロールは NOBYPASSRLS にする
- 外部キーの逆引きにはインデックスを張る
- `updated_at` はトリガーで更新する。アプリ側で更新しない

## 環境変数

- 各アプリは `.env.example` を持つ。`.env` は git 管理外
- 起動時に zod で検証し、不足があれば起動を失敗させる。検証は `packages/shared` の `parseEnv` に zod スキーマを渡して行い、`envBoolean` `jsonArrayEnv` `publicSchemeEnv` を再利用する
- 開発時の既定値はコード側に持たせず `.env.example` に書く
- Cookie の Secure と `__Host-` は公開 scheme から導く。auth-api は `ISSUER`、`*-web` は `PUBLIC_SCHEME`。切り替え用の変数を追加しない
- https のときは本番の値を必須にする。auth-api は `SIGNING_KEY_PEM` `REDIS_URL` `COGNITO_ADAPTER=sdk`、`*-web` は `REDIS_URL` と https の `ISSUER` / `API_BASE_URL` と `SPA_DIR`。欠けたら起動を失敗させる
- `*-web` の SPA の配り方は `SPA_DIR` と `SPA_DEV_SERVER_URL` で決める。`SPA_DIR` は `react-router build` の `build/client` で、設定があれば優先する。`SPA_DEV_SERVER_URL` は `react-router dev` の URL で開発専用。`.env.example` は `SPA_DEV_SERVER_URL` を有効にし、`SPA_DIR` をコメントで示す

## 命名

- ファイルは kebab-case。型は PascalCase。関数と変数は camelCase。React コンポーネントのファイルは `.tsx`
- テストは対象ファイルと同じディレクトリに `*.test.ts`
- 真偽値に否定形を使わない
- 比較は `===` を使う。null と undefined をまとめて判定するときだけ `== null` を許す。oxlint の eqeqeq で強制する
