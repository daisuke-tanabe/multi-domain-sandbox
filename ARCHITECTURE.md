# ARCHITECTURE.md

## このファイルの目的

技術設計・実装規約。機能実装・データモデル変更・キャッシュ・インフラ関連の作業では必ず本ファイルに従う。
認証アーキテクチャの詳細は `docs/design/` を正とする。本ファイルは実装レベルの規約を定める。

## リポジトリ構成

pnpm workspace のモノレポ。

```text
apps/auth-api         auth.sandbox.com。OpenID Provider。/authorize /token /login /logout /admin と、auth-web の SPA の配信、SPA 向けの /api/login /api/portal /api/logout
apps/auth-web         auth-api が同一オリジンで配る React Router の SPA。ログイン、ポータル、Global Logout の画面。サーバーは持たない
apps/crm-web          <tenant>.crm.sandbox.com。CRM の Web。React Router の SPA と、それを配る薄い BFF。src/main.ts が BFF を起動し、app/ に画面
apps/crm-api          api.crm.sandbox.com。CRM の Resource Server。definition.ts に役割と権限、end-users/ にエンドユーザーの feature を domain / application / infrastructure / interface の 4 層で持つ
apps/cms-web          <tenant>.cms.sandbox.com。CMS の Web。crm-web と同じ構成
apps/cms-api          api.cms.sandbox.com。CMS の Resource Server。definition.ts に役割と権限、posts/ に投稿の feature を 4 層で持つ
packages/api-contract HTTP のリクエストとレスポンスの zod スキーマと型。サーバーの入力検証と SPA の型、フォーム検証、受信検証で同じものを使う。依存は zod だけ
packages/shared       Result 型、ストア抽象と StoreFactory、暗号、JWT / JWKS 取得、Cookie、ロガー、環境変数、pg の問い合わせ補助、識別子の enum、セッション期限、SPA の配信 (spa.ts)、テスト補助 (test-support)
packages/oidc-client  *-web 向け OIDC Client 共通モジュール。/auth/* とセッション
packages/web-core     apps/*-web の BFF 本体。/auth/* の受け口、/session、/api/* の中継、SPA の配信、エラー画面、設定スキーマ、起動関数を持つ
packages/web-ui       apps/*-web が共有する React コード。lib/ に BFF との通信、ルートの clientLoader、書き込みの useAction、components/ に共通の枠と shadcn/ui の部品 components/ui、features/ にホームと管理アカウントの画面、styles.css に Tailwind の入口
packages/api-core     apps/*-api のフレームワーク。auth-api は使わない。ServiceDefinition、Token 検証、member 解決と権限の確定、/v1/me と /v1/members、MemberRepository、AuthAdminClient、withTenant、設定スキーマ、起動関数を持つ
tools/provision       AWS 専用。identity と各サービスの DB のロール、スキーマ、シードを冪等に適用し、Cognito テストユーザーを作る。SQL は db/<name>/init を共用する
db/identity, db/crm, db/cms  各 DB の初期化 SQL とシード。DB はサービスごとに分かれ、コンテナも分かれる
docs/                 仕様と設計
```

apps/crm-web / cms-web は BFF の起動口と、そのサービスの画面だけを持つ。

```text
apps/crm-web/
  src/main.ts             startWebCore("crm-web") を呼ぶだけ。設定スキーマと依存の組み立ては packages/web-core/src/config.ts と start.ts
  app/root.tsx            packages/web-ui の RootDocument、HydrateFallback、RootErrorBoundary を置き、clientLoader = loadShell と shouldRevalidate を宣言する。styles.css の import と configureZodLocale() の呼び出し
  app/routes.ts           ルート定義。feature ごとの *.route.tsx を指す
  app/features/home/home.route.tsx      ホーム。packages/web-ui の HomePage を置くだけ
  app/features/end-users/               CRM 固有の feature。end-users.route.tsx、end-users.api.ts、end-user-form.tsx、end-user-table.tsx。cms-web は features/posts/
  app/features/members/members.route.tsx  packages/web-ui の MembersPage を置くだけ
  react-router.config.ts  ssr: false、appDirectory app、buildDirectory build
  vite.config.ts          packages/web-ui の spaViteConfig にポートを渡すだけ。127.0.0.1:5173 で待ち受け、cms-web は 5174、auth-web は 5175
  tsconfig.json           src 用。tsconfig.base.json を継承する
  tsconfig.app.json       app 用。ブラウザ向けの設定は tsconfig.spa.json にあり、ここは include と .react-router/types だけを足す
```

apps/crm-api / cms-api は `definition.ts` でサービスの役割と権限を `defineService` で宣言し、サービス固有の feature を 4 層で持つ。`main.ts` は定義、スキーマ名、routes を `startApiCore` に渡す。Token 検証、member 行の解決、権限の確定、`/v1/me`、管理アカウントの `/v1/members` は `packages/api-core` が提供し、apps 側には書かない。
サービスごとに web と api を 1 プロセスずつ動かし、共通の実装は packages に置いて共有する。
サービスを増やすときは apps に web と api を 1 組追加し、web 側に `app/` の routes とサービス固有の画面、api 側に `definition.ts` と routes を書き、`db/<service>/init` に members と permission_overrides を含む DB を用意し、`.env` でサービス固有の値を渡す。
`*-web` はクライアントを意味する。ただし Token と Cookie をブラウザへ出さない BFF 方式のため、SPA の配信と `/auth/*`、`/session`、`/api/*` の中継を担う薄いサーバーは必ず残す。

## 技術スタック

| 項目 | 採用 | 備考 |
| --- | --- | --- |
| ランタイム | Node.js 24 | `.tool-versions` で固定 |
| 言語 | TypeScript。strict | `tsc --noEmit` で型検査。サーバーは tsx で直接実行 |
| HTTP | Hono + @hono/node-server | 全アプリ共通 |
| 画面 | React Router v8 の SPA モード。ビルドは Vite。UI 部品は shadcn/ui、スタイルは Tailwind CSS v4、フォームは react-hook-form | `apps/*-web/app` に置き、`react-router build` の `build/client` を BFF が配る。共通の React コードと shadcn/ui の部品は `packages/web-ui`。見た目の規約は `DESIGN.md` |
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
| 127.0.0.1 | 5173 / 5174 / 5175 | crm-web / cms-web / auth-web の `react-router dev`。開発時だけ BFF と auth-api が中継する |

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
- ルートの `clientLoader` は `packages/web-ui` の `loadShell` を使う。`/session` を読み、未ログインなら `/auth/login` へ送り、ログイン済みなら `/v1/me` を読んで `useShell` と `usePermissions` に渡す。`?logged_out=1` のときだけログアウト済み画面を出す。画面遷移では読み直さないよう `shouldRevalidate` を false にし、書き込み後は `useAction` の revalidate で更新する
- 共通の React コードは `packages/web-ui` に置く。BFF との通信 `lib/api.ts`、loader の `lib/shell.ts`、`<html>` と ErrorBoundary の `components/root-document.tsx`、枠の `components/app-shell.tsx`、両サービス共通の `features/members/`、`styles.css`、Vite 設定の `vite.ts`。`apps/*-web/app` には `routes.ts` と feature ディレクトリだけを置き、通信や CSRF の扱いを書かない。feature は `<name>.route.tsx` `<name>.api.ts` と部品を同じディレクトリに持つ
- フォームは react-hook-form と契約の入力スキーマ、UI 部品は shadcn/ui。詳細は `DESIGN.md`
- 画面の出し分けは `/v1/me` の `permissions` で行う。ナビゲーションは `permission` を持つ項目を確定した権限で絞り、ボタンは該当する permission がなければ出さない。最終判定は API が行う
- 静的配信では CSP の `script-src` を `'self'` と `index.html` のインラインスクリプトの sha256 ハッシュに限定し、`'unsafe-inline'` を使わない。`/assets/*` は immutable で長期キャッシュし、それ以外の GET は `index.html` を返す
- Vite への中継は開発専用。`'unsafe-inline'` と Vite の origin および ws origin への `connect-src` を許すため、`PUBLIC_SCHEME=https` では `SPA_DIR` を必須にして中継モードで起動できないようにする
- `SPA_DIR` も `SPA_DEV_SERVER_URL` もなければ最小の HTML だけを返し警告を出す。テストはこのモードで `/auth/*` `/session` `/api/*` を検証する
- 不明なホストの 400 や未契約の 403 のように、SPA へ渡す前に起きるエラーは `packages/web-core/src/views` のサーバー側 HTML で返す。それ以外の画面をサーバー側で描かない
- SPA の配信とそれに応じた CSP は `packages/shared/src/spa.ts` の `mountSpa` と `spaCsp` に集約する。web-core と auth-api で同じものを使う。`/assets/*` はテナントの解決もセッションの読み込みも要らないため、`mountSpaAssets` をそれらのミドルウェアより前に mount する

## auth-web と auth-api の契約

auth の画面は `apps/auth-web` の React Router SPA で描き、auth-api が同一オリジンで配る。別ホストにしない。

| 経路 | 内容 |
| --- | --- |
| `GET /api/login?rid=&error=` | ログイン画面の材料。CSRF Cookie を発行し `rid` `csrfToken` と、`error` があればその文言を返す。rid が期限切れなら 400 `expired_request` と文言。rid なしで SSO Session があれば `redirectTo: "/"` |
| `POST /login` | 従来どおりフォーム POST。成功は `/authorize` の続きへ 303、rid なしはポータルへ。失敗は `/login?rid=..&error=<kind>` へ 303 |
| `GET /api/portal` | ログイン中ユーザーのメールと、テナントごとに入れるサービスの一覧。SSO Session がなければ 401 |
| `GET /api/logout?client_id=&tenant=` | SSO Session があれば CSRF を発行し `authenticated: true` と `csrfToken`。なければ Cookie を消し `authenticated: false`。どちらも戻り先 `returnTo` を含む |
| `POST /logout` | 従来どおりフォーム POST。Global Logout 後に `/logout?client_id=&tenant=` へ 303 し、SPA が完了画面を出す |
| それ以外の GET | SPA の配信。`/` ポータル、`/login`、`/logout` を SPA が描く |

- 資格情報の送信は HTML フォームの POST を維持する。SPA は JSON で `rid` と CSRF を受け取ってフォームを描くだけで、パスワードを fetch で送らない。リダイレクト連鎖とレート制限を変えないため
- ログイン失敗の理由はクエリの `error` に種類だけを載せ、文言は auth-api が `/api/login` で返す。ユーザー名やパスワードを URL に載せない
- `/authorize` の不正な redirect_uri、CSRF 不一致、入力不正、404、500 は auth-api の `views/pages.ts` の最小 HTML で返す。SPA へリダイレクトして運ばない
- SPA 向け JSON は `/api/` 配下に置き、`Cache-Control: no-store` を付ける。`/api/login` と `/api/logout` は `/login` `/logout` と同じレート制限にかける
- 共通の React コードは `packages/web-ui` から `styles.css`、`Notice`、shadcn の部品だけを使う。BFF 向けの `lib/api.ts` と `loadShell` は使わない

## API 契約

HTTP 境界の形は `packages/api-contract` の zod スキーマで 1 か所に定める。サーバーとクライアントで別々に型を書かない。

- 置き場所は経路の持ち主ごとに分ける。`core` は api-core の `/v1/me` と `/v1/members`、`crm` と `cms` はサービス固有の資源、`auth` は auth-api の SPA 向け `/api/*` と管理 API、`web` は BFF の `/session`。共通のエラー応答は `common`
- 命名は `<名前>Schema` と `<名前>` 型の対。リクエストは `<資源>InputSchema` と `<資源>PatchSchema`、レスポンスは `<資源>ResponseSchema` のように用途を末尾に付ける。JSON のキーは snake_case のまま
- サーバーは zValidator にこのスキーマを渡す。役割名や権限名のようにサービス定義で決まる制約は、契約では `z.string()` にしてサーバー側で `refine` を重ねる
- サーバーのレスポンスは契約の型で `satisfies` し、余計なキーや欠けたキーをコンパイル時に検出する
- SPA は契約の型で API 呼び出しを書き、レスポンスは受信時に契約のスキーマで検証する。フォームの検証は同じ入力スキーマを react-hook-form の resolver に渡す
- 契約パッケージは zod 以外に依存しない。Hono や React の型を持ち込まない
- 契約を変えるときはサーバー、SPA、テストを同じコミットで直す

## レイヤー規約

バックエンドはクリーンアーキテクチャの 4 層で構成する。依存は内側へ向く。domain は何にも依存せず、application は domain だけ、infrastructure は application と domain、interface はすべてを参照できる。逆向きの import は `scripts/check-layers.ts` が検出し、`pnpm lint` で失敗させる。

| 層 | 置くもの | 使ってよい外部依存 |
| --- | --- | --- |
| domain | エンティティと値の型、純粋な業務規則。マスクの規則、役割から権限を確定する規則、寿命の既定値 | なし。`@sandbox/shared` の型と純粋関数まで |
| application | ユースケースと ports。ユースケースは deps と入力を受け取り Result を返す。ports はリポジトリ、外部サービス、ストアのインターフェース | zod、`@sandbox/shared`。hono と pg は不可 |
| infrastructure | ports の実装。pg、memory、HTTP クライアント、Cognito SDK、ストア | pg、AWS SDK、fetch など何でも |
| interface | Hono の routes、middleware、app の組み立て、サーバー側 HTML。契約のスキーマで入力を検証し、ユースケースを呼び、結果を契約の型に写す | hono、`@sandbox/api-contract` |

サービスの apps は feature を先に切り、その中に 4 層を置く。共通基盤の packages/api-core と apps/auth-api は層を先に切る。

```text
apps/crm-api/src/
  main.ts                  起動。definition と routes を startApiCore に渡すだけ
  definition.ts            役割と権限の宣言
  end-users/
    domain/end-user.ts     型とマスクの規則
    application/           ports (end-user-repository.ts) とユースケース (end-users.ts)
    infrastructure/        pg-end-user-repository.ts、memory-end-user-repository.ts
    interface/routes.ts    Hono の routes

packages/api-core/src/
  domain/                  member.ts、service-definition.ts
  application/             ports/、resolve-tenant-context.ts、members.ts、access-token.ts
  infrastructure/          pg-member-repository.ts、memory-*.ts、auth-admin-client.ts、db.ts
  interface/http/          app.ts、middleware.ts、routes/
  config.ts start.ts index.ts test-support.ts   合成の起点。層の外に置き、どの層も参照できる

apps/auth-api/src/
  domain/                  identity.ts の型、policy.ts の既定値
  application/             ports/、deps.ts、usecases/
  infrastructure/          pg / memory の IdentityRepository、Cognito のアダプタ、stores
  interface/http/          app.ts、routes/、views/
  config.ts main.ts test-support.ts
```

- routes は入力検証、ユースケース呼び出し、契約の型への写しだけを行う。業務の分岐やリポジトリの直接呼び出しを routes に書かない
- ユースケースの失敗は Result の error で返し、HTTP のステータスへの写しは interface が行う
- 層の外に置く合成の起点 (main、start、config、index、test-support、definition) は例外で、どの層も参照できる。逆に各層からこれらを参照しない
- テストは対象と同じディレクトリに置く。feature の中でも同じ

- routes は ports を直接呼ばず usecases を呼ぶ
- usecases は adapters を import しない。ports だけに依存する
- main.ts と start.ts でのみ adapters を組み立てる
- `*-api` の認証は `packages/api-core/src/usecases/resolve-tenant-context.ts` に置く。Host 確認、Bearer 検証、自サービス DB の member 行の取得と JIT 作成、上書きの適用による権限の確定までを usecase が行い、`auth/middleware.ts` はその Result を HTTP ステータスに写像するだけにする。identity DB は参照しない
- `*-api` のサービス固有ルートは `apps/<service>-api/src/<resource>/routes.ts` と `repository.ts` に置く。routes は `requirePermission` で要求 permission を宣言し、repository は `withTenant` で `app.tenant_id` を設定したトランザクションの中で SQL を実行する
- `*-web` の画面は `apps/<service>-web/app/features/` に置き、BFF との通信は `packages/web-ui` の `api` と `loadShell` を経由する。画面から `fetch` を直接呼ばない

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
- 揮発ストアのキーに秘密値をそのまま使わない。Cookie の値、Refresh Token、認可コード、rid、CSRF の参照 ID は `keyDigest` の SHA-256 をキーにし、値の中にも生の秘密値を持たせない。ストアの読み取りが漏れても提示できる値にならないようにする
- SSO Session の作成、`/authorize` の到達、Refresh、失効、再利用検知、招待と解除、MFA の登録と失敗は identity DB の `audit_events` に監査イベントとして残す。Token 値、Cookie 値、パスワード、TOTP の secret は残さない
- ブラウザから届いた IP と User-Agent は SSO Session の作成時と `/authorize` の到達時に `auth_sessions` に記録する。前回と違えば `environment_changed` の監査イベントと警告ログを出すが、それだけでは失効させない。Refresh はサーバー間通信で端末の環境を運ばないので比較しない。Refresh Token の再利用や別 Client からの提示のような強い侵害シグナルは系列を即時失効させる
- セッションの一覧は `auth_sessions` と `auth_session_clients` から作り、本人はポータルで他の端末を失効できる。失効は Global Logout と同じ手順で、Refresh Token 系列の失効、Cognito の Refresh Token 失効、SSO Session 削除、Back-Channel Logout を行う
- 招待の解除は identity の割り当てを消すだけで終わらせない。その人の SSO Session のうち解除されたサービスとテナントに入っているものについて Refresh Token 系列を失効させ、そのサービスへ Back-Channel Logout を送る。SSO Session 自体は残し、他のサービスには影響させない
- MFA は BtoB の前提として全員必須にする。初期の方式は認証アプリの TOTP で、方式は `MfaMethod` の判別共用体にして Passkey などを後から足せるようにする。Cognito の User Pool は OPTIONAL にし、必須化は auth-api が行う。登録していない人はパスワード認証のあとに登録画面へ送り、登録が終わるまで SSO Session を作らない。登録済みの人はログインのたびにコードを求める。テナント単位の方針は将来の拡張
- TOTP の登録は auth-api がパスワード認証で得た Cognito の Access Token で AssociateSoftwareToken を呼んで始める。secret と QR は auth-api が決めた期限で失効させ、期限が来たら AssociateSoftwareToken をやり直して新しい secret と QR を出す。secret は暗号化して揮発ストアに置き、DB には登録した方式と日時だけを残す

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
- https のときは本番の値を必須にする。auth-api は `SIGNING_KEY_PEM` `REDIS_URL` `COGNITO_ADAPTER=sdk` `SPA_DIR`、`*-web` は `REDIS_URL` と https の `ISSUER` / `API_BASE_URL` と `SPA_DIR`。欠けたら起動を失敗させる
- `*-web` と auth-api の SPA の配り方は `SPA_DIR` と `SPA_DEV_SERVER_URL` で決める。auth-api の https では `SPA_DIR` を必須にする。`SPA_DIR` は `react-router build` の `build/client` で、設定があれば優先する。`SPA_DEV_SERVER_URL` は `react-router dev` の URL で開発専用。`.env.example` は `SPA_DEV_SERVER_URL` を有効にし、`SPA_DIR` をコメントで示す

## 命名

- ファイルは kebab-case。型は PascalCase。関数と変数は camelCase。React コンポーネントのファイルは `.tsx`
- テストは対象ファイルと同じディレクトリに `*.test.ts`
- 真偽値に否定形を使わない
- 比較は `===` を使う。null と undefined をまとめて判定するときだけ `== null` を許す。oxlint の eqeqeq で強制する
