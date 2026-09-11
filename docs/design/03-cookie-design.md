# Cookie設計

## 結論

Cookieは3種類のみ。SSO Cookie、テナント × サービスごとのセッションCookie、認可フロー中の一時Cookie。
すべて HttpOnly / Secure / SameSite=Lax とし、Domain属性は指定しない。ホスト単位に閉じ、サブドメイン間でも共有しない。tanaka.crm と tanaka.cms は同じテナントでもホストが異なるため Cookie を共有しない。
Cookie値はサーバー側ストアを指すランダムIDのみで、Tokenやユーザー情報を入れない。

## Cookie一覧

| Cookie名 | 発行ホスト | 属性 | 寿命 | 値 |
| --- | --- | --- | --- | --- |
| `__Host-sso_session` | auth.sandbox.com | HttpOnly; Secure; SameSite=Lax; Path=/ | Session Cookie。サーバー側TTLで管理 | SSO Session ID |
| `__Host-auth_csrf` | auth.sandbox.com | HttpOnly; Secure; SameSite=Lax; Path=/ | 30分 | ログインフォーム用CSRFトークンのID |
| `__Host-tenant_session` | tanaka.crm.sandbox.com 等 | HttpOnly; Secure; SameSite=Lax; Path=/ | Session Cookie。サーバー側TTLで管理 | Tenant Session ID |
| `__Secure-tenant_pre_auth` | tanaka.crm.sandbox.com 等 | HttpOnly; Secure; SameSite=Lax; Path=/auth | 30分 | pre-auth state参照ID |

Tenant側のCookie名はホストが異なるため同名でよい。仕様書10章の `tanaka_crm_session` 表記はホスト単位に分かれていることを示す概念名として扱い、実装上は共通名にする。サーバー側ストアのキーは `<clientId>:<tenantSlug>:<sessionId>` で、Cookie値だけでは別ホストのセッションを引けない。

## 設計原則

### Domain属性を指定しない

Domain属性を省略した Cookie は発行ホストにのみ送信される。`tanaka.crm.sandbox.com` の Cookie は `suzuki.crm.sandbox.com` にも `tanaka.cms.sandbox.com` にも `auth.sandbox.com` にも届かない。仕様書2.2の禁止事項に対応する。

`__Host-` プレフィックスは Domain 属性の付与自体をブラウザが拒否するため、誤設定を構造的に防げる。

### サブドメイン間は同一サイト扱いである点への注意

`*.sandbox.com` は Public Suffix List 上で同一サイトとみなされる。SameSite 属性はサブドメイン間の送信を制限しない。ホスト分離は Domain 属性の省略と `__Host-` プレフィックスで実現するものであり、SameSite に頼らない。

### 値はランダムIDのみ

- 256bitのCSPRNG由来。base64url表現
- Cookie値にJWT、user_id、tenant_id、roleを入れない
- すべてサーバー側ストアを参照するキーとする

### SameSite=Lax を選ぶ理由

認可フローはトップレベルGETリダイレクトでCookieが必要になる。

- `/authorize` 到達時に `sso_session` が必要
- `/auth/callback` 到達時に `tenant_pre_auth` が必要

Strict はこれらのクロスサイトナビゲーションで Cookie を送らないため採用しない。サービスを tanaka.crm.com のような別ドメインに置いた場合も Lax なら動作する。POSTエンドポイントはCSRFトークンで別途防御する。

### ローカル開発時の扱い

`__Host-` はHTTPSが必須。ローカルはHTTPのためプレフィックスなしの名前に切り替える。切り替えは設定値で行い、本番ビルドではプレフィックスありを強制する。

## セッションIDのローテーション

| タイミング | 動作 |
| --- | --- |
| Cognito認証成功 | 新しい SSO Session ID を発行。認証前に存在した匿名 Cookie があれば破棄 |
| code交換成功 | 新しい Tenant Session ID を発行。既存の Tenant Session があれば削除 |
| Refresh Token更新 | Tenant Session ID は変更しない。Token のみ更新 |
| Logout | Cookie を Max-Age=0 で削除し、ストアからも削除 |

## 有効期間

Cookie は Session Cookie とし、実寿命はサーバー側で管理する。

| セッション | アイドル | 絶対 | 判断事項 |
| --- | --- | --- | --- |
| SSO Session | 2時間 | 12時間 | D6 |
| Tenant Session | 30分 | 12時間 | D6 |
| pre-auth | 30分 | 30分 | 固定。ログイン画面を開いたまま離席する時間を許容する |

Tenant Session が切れても SSO Session が有効なら無画面で復帰するため、体感のログイン持続時間は SSO Session の寿命で決まる。

## 禁止事項

- `Domain=.sandbox.com` を含むあらゆる親ドメインCookie
- Cookie値へのJWT / ユーザー属性 / テナント情報の格納
- HttpOnlyなしの認証Cookie
- SameSite=None の認証Cookie
- JavaScriptからのCookie参照を前提とした実装
