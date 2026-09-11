# テスト計画

## 結論

テストは Unit / Integration / E2E / Security の4層で構成する。
E2E は「初回ログイン」「別テナント SSO」「Tenant Logout」「他テナントデータ拒否」「別サービス SSO と契約判定」の5シナリオを必須とし、これが通ることを各フェーズの完了条件にする。
エラーケース一覧の各行を Integration テストに1対1で対応させる。
現在の自動テストは auth-api / crm-api / cms-api / web-core / shared で 136 件が通っている。Redis 実装の 2 件は `REDIS_URL` があるときだけ動く。oidc-client は web-core のテストを通して検証し、api-core は crm-api / cms-api のテストを通して検証する。crm-web / cms-web の `src/main.ts` は `packages/web-core` の起動関数を呼ぶだけのため BFF のテストは共有パッケージ側に置き、crm-api / cms-api はサービス固有の routes を持つため各 app にテストを置く。web-core の E2E は実物の crm-api / cms-api を `test-support` から接続し、SPA は配らずに `/auth/*` `/session` `/api/*` を検証する。auth-api のテストも SPA は配らず、auth-web と同じ経路で `/api/login` `/api/portal` `/api/logout` の JSON とフォーム POST の応答を検証する。React の画面は `*-web` も auth-web も `scripts/chrome-check.ts` が実 Chrome で描画して確認する。

## テストピラミッド

| 層 | 対象 | ツール | 実行タイミング |
| --- | --- | --- | --- |
| Unit | PKCE 計算、JWT 生成と検証、JWKS の再取得制御、Cookie 属性、redirect_uri テンプレート照合、secret ハッシュ、Host 解決、return_to 検証、Role→Permission | Vitest | 毎コミット |
| Integration | Auth / Tenant / API の各エンドポイント。ストアと Cognito はモック | Vitest + Hono テストクライアント | 毎コミット |
| E2E | 5種のプロセスと7ホストをまたぐフロー。ブラウザ相当のクライアントで Cookie を追う | Vitest。ブラウザ確認は Chrome DevTools スクリプト | PR ごと |
| Security | 攻撃シナリオの再現 | Vitest | PR ごと |

## Unit テスト

### Auth Server

| 対象 | ケース |
| --- | --- |
| PKCE | S256 の計算。verifier 長の下限上限。plain の拒否 |
| redirect_uri テンプレート照合 `matchRedirectUriTemplate` | 展開結果と完全一致する redirect_uri から slug を返す。末尾スラッシュ、クエリ追加、大文字、空 slug、多段ラベル `evil.tanaka.crm`、ホスト後ろへの付け足し `…:3001.evil.example` はすべて undefined。`expandRedirectUriTemplate` の展開結果を照合すると元の slug に戻る |
| テナント解決 | テンプレートから取り出した slug で tenants を引く。slug が未知なら invalid_redirect_uri。テナントなしの認可は存在しない |
| secret ハッシュ `hashSecret` / `verifySecret` | `sha256$` で始まる。元の secret で true、別の secret で false。`plain` や `scrypt$a$b` のような形式外の保存値は false |
| secret ローテーション `verifySecretAgainstAny` | active なハッシュが複数あるとき、いずれかに一致すれば true。どれにも一致しない、または一覧が空なら false |
| アクセス判定 | user_disabled → tenant_suspended → not_contracted → no_membership / membership_inactive の順で最初の理由を返す。user、契約、サービスへの割り当ては並列取得。割り当ては認可リクエストの client_id のサービスだけを見る |
| users の解決 | cognito_sub で一致する行 → 同じメールで cognito_sub が NULL の行に紐付け → JIT 作成の順。同じメールが別の sub に紐付いていれば拒否 |
| ID Token 生成 | 必須 claims の存在。aud=client_id。nonce / sid / tenant_id / tenant_slug の反映 |
| Access Token 生成 | aud に client.audience と issuer。role を含まない。tenant_id と client_id の反映 |
| logout_token 生成 | aud=client_id。sid と events。nonce なし |
| Cognito Token 暗号化 | 暗号化して復号で元に戻る。鍵 ID が保存される |
| Cognito アダプタ | 例外種別ごとの理由コード写像 |
| セッション寿命 | アイドルと絶対の判定境界 |

### 共有ストア

| 対象 | ケース |
| --- | --- |
| `MemoryKeyValueStore.get` | TTL 経過後は undefined |
| `MemoryKeyValueStore.getAndDelete` | 同じキーを同時に消費しても値を返すのは 1 回 |
| `MemoryKeyValueStore.setIfAbsent` | 未登録なら true で書き、登録済みなら false で書かない。TTL 経過後は再取得できる |
| `MemorySetStore` | 同時に add した要素がすべて残り、remove で個別に外せる |
| `MemoryCounterStore` | increment が 1 から加算され、窓の経過後に 1 に戻る |
| `RemoteJwksSource` | 通常取得の直後でも未知の kid による強制再取得は 1 回通り、その後 60 秒は間引かれる。同時の取得要求は 1 回の fetch にまとまる |

### Tenant Web Application と OIDC Client モジュール

| 対象 | ケース |
| --- | --- |
| Host 解決 | tanaka.crm.localhost:3001 → tenantSlug=tanaka。BASE_HOST に一致しない Host は 404。ラベルが2段以上の Host は拒否 |
| サービス設定 | CLIENT_ID / CLIENT_SECRET / SERVICE_NAME / BASE_HOST / API_BASE_URL の必須項目 |
| return_to 検証 | 相対パス許可。絶対 URL / `//` / `javascript:` / `\` 拒否 |
| ID Token 検証 | 署名 / iss / aud / exp / nonce / alg 固定 / tenant_slug と Host の一致 |
| Cookie 生成 | HttpOnly / Secure / SameSite=Lax / `__Host-` / Domain なし |
| Session キー | ストア `<clientId>:sess` のキー `<tenantSlug>:<id>`。同じ Cookie 値でも別ホストから引けない |
| sid 逆引き | ストア `<clientId>:sid` のキー `sid:<sid>` に複数テナントのセッションが入り、まとめて削除できる |
| Token 更新判定 | 残り60秒未満で Refresh を発火 |
| 同時 Refresh | 同じセッションで同時に 2 リクエストが走っても Refresh は 1 回。両方 200 で、Refresh Token は 1 回だけローテーションされ、セッション Cookie が残る |

### API Server

| 対象 | ケース |
| --- | --- |
| Host → aud | API_BASE_URL がそのまま aud になり、URL のホストだけを受け付ける |
| Access Token 検証 | aud 不一致で拒否。ID Token を渡すと拒否。alg=none 拒否 |
| ServiceDefinition | `members:read` `members:invite` `members:manage` が自動で足される。`isRole` `isPermission` が語彙外を拒否する |
| resolvePermissions | 役割の既定に対し、allow の上書きで役割にない permission が加わり、deny の上書きで役割にある permission が外れる。deny が優先し、未知の permission 名は無視する |
| マスキング | `mask` がメールを先頭 1 文字とドメイン、電話を末尾 4 桁だけ残す |
| Repository | tenant_id 引数の必須性。省略で型エラーになること |

## Integration テスト

エラーケース一覧の番号をテスト名に含める。

### Auth Server

| 番号 | テスト |
| --- | --- |
| A1-A4 | リダイレクトせず 400 を返し、Location ヘッダがないこと。A3 はテンプレート不一致、A3b はテンプレートに一致するが slug が tenants にないホスト |
| A5-A10 | redirect_uri へ error と state 付きで 302 |
| A11-A13, A17, A18 | access_denied と error_description の理由。SSO Session は維持される |
| A14-A15 | `/login?rid=` へ遷移し Cookie が削除される |
| L1-L12 | 各エラーの応答と文言。失敗は `/login?error=<kind>&rid=` への 303 で、文言は `/api/login?rid=&error=` の `errorMessage` で確認する。L3-L5 が同一文言。L1 は `/api/login` が 400 `expired_request` |
| ログイン画面 | `/api/login?rid=` が CSRF Cookie を発行し `rid` と `csrfToken` を返す。`/api/login` に `Cache-Control: no-store` が付く。rid なしで SSO Session があれば `redirectTo: "/"` |
| T1-T16 | 各エラーの OAuth エラーコード。T1 は誤った secret と revoked 済みの secret の両方で invalid_client。T4 で Refresh Token 系列が失効。T15 で契約解除後の Refresh が invalid_grant |
| M2 | secret ローテーション。新 secret を active で追加した直後は新旧どちらの Basic 認証でも /token が 200。旧行を revoked にすると旧 secret だけ invalid_client |
| 正常 | code 交換で id_token / access_token / refresh_token が返る。expires_in=900 |
| 正常 | id_token の aud が client_id、tenant_slug が redirect_uri のテナント |
| 正常 | access_token の aud が client.audience。crm と cms で異なる |
| 正常 | refresh_token grant でローテーションされ、旧値が失効する |
| 正常 | /revoke が冪等 |
| 正常 | /.well-known/openid-configuration と /jwks の内容 |
| ポータル | `/api/portal` の JSON で確認する。alice で `tenants` に tanaka の CRM と CMS、suzuki の CRM のみ。suzuki.cms は出ない。各サービスの `loginUrl` は `<tenant>.<service>` の /auth/login。役割は含まない。`email` は alice のメール |
| ポータル | どのサービスにも割り当てのない carol は `tenants` が空。SPA が「利用できるサービスがありません。管理者に招待を依頼してください。」を出す |
| ポータル | SSO Session なしの `/api/portal` は 401 `unauthenticated` |
| 管理 API | R1。Basic 認証なしで `/admin/service-members` を呼ぶと 401 |
| 管理 API | 招待と初回ログインの紐付け。crm の secret で dave のメールを tanaka に招待すると 201 で `linked: false`。dave がログインすると code が発行され、一覧の `linked` が true になり、`findUserByCognitoSub` が招待時の user_id を返す |
| 管理 API | R4。cms の secret で cms を契約していない suzuki に招待すると 403 |
| 管理 API | 割り当ての解除。alice を tanaka × crm から DELETE で外すと 204 で、次の認可が `access_denied` `no_membership` になる |
| Global Logout | `/api/logout?client_id=crm&tenant=tanaka` が SSO Session ありで `authenticated: true` と `csrfToken`。`POST /logout` で `sso:clients` のサービスごとに1通の logout_token。aud がサービス。完了後は `/logout?client_id=crm&tenant=tanaka` へ 303 し、`/api/logout` が `authenticated: false` と `returnTo` `{label: "CRM (tanaka)", href}` を返す。href は redirect_uri_template を tenant で展開した origin |
| 並行性と悪用 | 同じ Refresh Token を同時に 2 回提示すると成功は 1 つで、もう一方は invalid_grant。系列は失効せず、成功側の新 Token で次の Refresh が通る |
| 並行性と悪用 | 別 Client の Basic 認証で Refresh Token を提示すると invalid_grant になり、その後の正規 Client からの提示も invalid_grant。系列全体が失効する |
| 並行性と悪用 | ログイン済みの Cookie で再ログインすると旧 SSO Session がストアから消え、SSO Session は 1 件だけになる |
| 並行性と悪用 | 同じ IP から `/login` を 61 回叩くと 429 |
| 並行性と悪用 | Basic 資格情報のパーセントエンコードが壊れていると invalid_client。500 にならない |

### Tenant Web Application

| 番号 | テスト |
| --- | --- |
| C1-C18 | 各エラーの応答とセッション未作成。C4 は理由ごとの文言。C17 は tenant_slug 不一致 |
| 正常 | /auth/login が Host に応じた client_id と redirect_uri で /authorize へ 302。pre-auth Cookie の属性 |
| 正常 | /auth/callback がセッション Cookie を新規発行し、pre-auth Cookie を削除する |
| 正常 | 既存セッションがある状態の /auth/callback でセッション ID が変わる |
| 正常 | tanaka.crm の Cookie 値を suzuki.crm に送っても未ログイン扱い |
| O1-O3 | Tenant Logout |
| O6 | Back-Channel Logout。aud のサービスの全テナントのセッションが消え、他サービスは残る |
| 正常 | apiFetch が Bearer を付与し、期限切れ時に Refresh 後1回だけ再試行する |
| 正常 | `/session` が未ログインで `authenticated: false`、ログイン済みで `user` と `csrfToken` を返し、Token を含まない |
| 正常 | `/api/*` がセッションなしで 401、書き込みで `X-CSRF-Token` がなければ 403、JSON 以外の body で 415。GET はサーバー側の Access Token で API に中継される |
| 権限 | tanaka.cms の `/api/v1/me` は `role: owner` だが、cms 側の `posts:create` の deny により permissions に `posts:create` がなく `posts:update` がある。suzuki.crm は `role: viewer` で `end_users:create` がなく、上書きにより `end_users:unmask` がある。tanaka.crm では `end_users:create` がある |

### API Server

crm-api のテストは `apps/crm-api/src/app.test.ts`、cms-api は `apps/cms-api/src/app.test.ts`。api-core の共通部分はこの 2 つで検証する。

| 番号 | テスト |
| --- | --- |
| P1-P7, P13 | 各エラー応答 |
| P5 | crm 向け Access Token を cms-api の Host api.cms.localhost:3004 に送ると 401 |
| P16 | API_BASE_URL のホストと一致しない Host は 404。Token の有無に関わらず |
| P17 | CRM の役割 `admin` を CMS の招待に送ると 400。CRM に未知の permission を上書きで送ると 400 |
| 正常 | cms 向け Access Token を cms-api の Host api.cms.localhost:3004 に送ると 200 |
| 正常 | 有効な Token で自テナントのデータのみ返る |
| P12 | 他テナントのリソース ID で 404。有効な Token でも他テナントの end_users は見えない |
| CRM マスキング | owner はマスクなし。unmask のない member はメールが `a***@example.com`、電話が `***-****-1234` で `masked: true`。読み取り自体は通る |
| CRM 上書き | allow の上書きで役割にない permission が付く。suzuki × crm の viewer alice は `end_users:unmask` の allow によりマスクなしで読める |
| CRM 役割 | viewer は作成できず、member は更新でき、削除は owner と admin だけ |
| P8 | auth を通れるが member 行がない人は最初の呼び出しで viewer の行が作られる |
| 管理アカウント | owner が `POST /v1/members` で招待すると `AuthAdminClient.invite` が呼ばれ、返った user_id で指定した役割の member 行ができる。201 で `linked` を返す |
| 管理アカウント | owner は役割を変え、上書きを置き換えられる。viewer は 403 |
| 管理アカウント | 削除で `AuthAdminClient.revoke` が呼ばれ、自 DB の行が消える。未知の permission の上書きは 400 |
| CMS 上書き | deny の上書きで役割が持つ permission が外れる。tanaka × cms の alice は owner だが `GET /v1/posts` と `PATCH` が通り、`POST /v1/posts` が 403 |
| CMS 招待 | owner が editor を招待すると、その人は投稿を作成と削除できる |
| CMS 語彙 | CRM の役割名は CMS で受け付けない |
| 正常 | `/v1/me` が members の role と確定した permissions のソート済み配列、サービスの roles と permissions の語彙を返す。suzuki の alice は `viewer` と `["end_users:read", "end_users:unmask", "members:read"]` |
| role | Token に role claim があっても無視し DB の role を使う |
| RLS | app.tenant_id 未設定で 0 件。PostgreSQL 使用時のみ |

## E2E テスト

ローカルでは auth-api の `auth.localhost:3000`、crm-web の `tanaka.crm.localhost:3001` `suzuki.crm.localhost:3001`、crm-api の `api.crm.localhost:3002`、cms-web の `tanaka.cms.localhost:3003` `suzuki.cms.localhost:3003`、cms-api の `api.cms.localhost:3004` を起動し、Cognito はモックアダプタを使う。ユーザーは alice。identity では tanaka の crm と cms、suzuki の crm に入れる。CRM の DB では tanaka で owner、suzuki で viewer で `end_users:unmask` を allow されている。CMS の DB では tanaka で owner で `posts:create` を deny されている。

| # | シナリオ | 確認内容 |
| --- | --- | --- |
| E1 | 初回ログイン | tanaka.crm 未ログイン → SPA が `/session` を見て `/auth/login` へ → ログイン画面 → 認証 → ホームに owner と権限の表。Cookie が tanaka.crm と auth にそれぞれ1つ。Domain 属性なし |
| E2 | 別テナント SSO | E1 後に suzuki.crm へアクセス → ログイン画面を経由せずホームに viewer。ネットワークログにログイン画面の GET がないこと |
| E3 | Tenant Logout | tanaka.crm でログアウト → tanaka.crm は未ログイン、suzuki.crm と tanaka.cms はログイン済み。auth の Cookie は残る |
| E4 | 他テナントデータ拒否 | tanaka の Token で suzuki の end_user ID を指定 → 404 |
| E5 | 割り当てなし | どのサービスにも割り当てのない carol が tanaka.crm へアクセス → 403 アクセス権なし画面。ログイン画面は出ない。SSO Session は残る |
| E6 | Tenant Session 期限切れ復帰 | tanaka.crm の Session を強制失効 → 再アクセスで無画面復帰 |
| E7 | SSO Session 期限切れ | SSO Session を強制失効 → suzuki.crm へアクセスでログイン画面 |
| E8 | 認証失敗 | パスワード誤りで `/login?error=invalid_credentials&rid=` へ戻り、SPA が「ユーザー名またはパスワードが正しくありません」を出す。SSO Cookie が発行されない |
| E9 | 再訪 | E1 後に tanaka.crm を再読み込み → auth への通信が発生しない |
| E10 | role の差 | 同じ alice が tanaka では owner で `end_users:create` が yes、suzuki では viewer で no だが、上書きで `end_users:unmask` が yes。各サービスの DB が決める |
| E11 | Global Logout | auth の `/logout?client_id=crm&tenant=tanaka` で SPA の確認画面から「ログアウトする」→ tanaka.crm / suzuki.crm 両方が未ログイン。完了画面に「Sandbox からログアウトしました」と「CRM (tanaka) に戻る」 |
| E12 | 別サービス SSO と契約判定 | E1 後に tanaka.cms へアクセス → ログイン画面なしで code を取得し cms 向け Token でログイン。suzuki.cms へアクセス → 403「テナント suzuki は CMS を契約していません」。crm から Global Logout → Back-Channel で tanaka.cms も未ログイン |
| E13 | サービスごとの権限 | tanaka.cms では owner と表示されるが、cms 側の deny により `posts:create` が no で `posts:update` が yes。smoke と web のテストで確認する |
| E14 | ポータル | alice のポータルに「Sandbox ポータル」と tanaka の CRM と CMS、suzuki の CRM が並び、suzuki.cms は出ない。役割は出ない。carol は「利用できるサービスがありません」 |
| E15 | 招待と初回ログイン | alice が tanaka の crm に dave を招待 → identity に dave の users 行と割り当て、crm の DB に member 行。dave がログインすると同じ users 行に sub が紐付き tanaka.crm に入れる。auth-api のテストで確認する |

各シナリオで以下を横断的に検証する。

- URL、Cookie、HTML、`/session` の JSON、ネットワークログのいずれにも JWT が現れない
- サーバーログに Token / Cookie 値 / code が出力されない
- 各ホストの Cookie が他ホストに送られない

## Security テスト

| # | シナリオ | 期待 |
| --- | --- | --- |
| S1 | code 再利用 | 2回目が invalid_grant。1回目で得た Refresh Token が失効 |
| S2 | state 改ざん | Tenant が 400。/token が呼ばれない |
| S3 | redirect_uri 改ざん。別ホスト / パス違い / クエリ追加 / 末尾スラッシュ / 大文字 / 多段ラベル / 未登録テナントの slug | Auth が 400。Location なし |
| S4 | 別ブラウザへの code 注入 | nonce 不一致で 401 |
| S5 | crm の code を cms の secret で交換 | invalid_grant |
| S6 | Refresh Token 再利用 | 系列全体が失効し、正規の次回 Refresh も失敗する |
| S6b | 同じ Refresh Token の同時提示 | 成功は 1 つ。もう一方は invalid_grant。系列は失効しない |
| S6c | 別 Client からの Refresh Token 提示 | invalid_grant。系列全体が失効する |
| S7 | ID Token を API に送る | 401 |
| S8 | alg=none / HS256 の偽造 Token | 401 |
| S9 | Token の tenant_id を書き換え | 署名不正で 401 |
| S10 | X-Tenant-Id ヘッダやパスで他テナント指定 | 無視され自テナントのデータのみ |
| S11 | Cookie の Domain を .sandbox.com にして送信 | `__Host-` 名で受理されない |
| S12 | ログイン POST を CSRF トークンなしで送信 | 403 |
| S13 | ログアウト POST を別オリジンから送信 | 403 |
| S14 | パスワードスプレー | 429 と Retry-After。IP あたり 60 回/分、IP × ユーザー名あたり 10 回/分 |
| S14b | 再ログインによる旧 SSO Session の残留 | ストアに旧 SSO Session が残らない |
| S15 | 存在ユーザーと非存在ユーザーの応答比較 | 文言と応答時間の差がない |
| S16 | crm の Access Token を api.cms に送る | aud 不一致で 401 |
| S17 | suzuki 向けの code を tanaka.crm の callback で受ける | redirect_uri 不一致で invalid_grant。通過しても tenant_slug 不一致で 401 |
| S18 | 契約のない suzuki.cms の redirect_uri で /authorize | access_denied not_contracted。code は発行されない |
| S19 | 別サービスの割り当てで自サービスの API を呼ぶ | 割り当ては (tenant, service, user) の単位。Auth Server が認可リクエストの client_id に一致する割り当てがなければ code を出さず、API の aud も違うため別サービスの Token は 401 |
| S20 | Token に permissions claim を付けて送る | 無視され、役割の既定と permission_overrides から確定した権限だけで判定する |
| S21 | 管理 API を Basic 認証なしや別サービスの secret で呼ぶ | 401 invalid_client。認証した Client 自身の割り当てしか操作できない |
| S22 | 契約のないテナントへ招待 | 403 not_contracted。users にも tenant_service_members にも行が増えない |
| S23 | 招待済みのメールで別の Cognito ユーザーがログイン | 既存行に紐付かず、ログインが拒否される |
| S24 | 語彙にない role や permission | 400 invalid_request。members と permission_overrides に書かれない |

## テスト環境

| 項目 | 内容 |
| --- | --- |
| Cognito | `CognitoAuthenticator` インターフェースのモック実装。固定ユーザー alice / bob / carol / dave と失敗パターンを設定できる。dave は identity にいない |
| Session Store | インメモリ実装。TTL を進めるためのテスト用クロック |
| Identity DB | テストはインメモリの `IdentityRepository`。RLS テストはローカル PostgreSQL 必須 |
| サービスの DB | テストは `MemoryMemberRepository` と各サービスのインメモリ Repository。`MemoryAuthAdminClient` が auth-api の管理 API を代替する |
| auth インスタンス | `apps/auth-api/src/test-support.ts` が SPA を配らない `createAuthApp` を組み立てる。`readLoginContext(harness, rid, cookie)` が auth-web と同じく `/api/login?rid=` を呼び、フォームに入れる `csrf` と Cookie ヘッダと JSON の `body` を返す。`runLoginFlow` はこれで CSRF を受け取ってから `POST /login` する。HTML からトークンを抜き出す補助は持たない |
| web インスタンス | crm と cms の2サービス。`packages/web-core/src/test-support.ts` がサービスごとに別インスタンスを作る。BASE_HOST は crm.localhost:3001 / cms.localhost:3003。SPA は配らず、簡易ブラウザの `Browser.fetch` `readJson` `readSession` と、`/auth/login?return_to=<path>` から入る `loginThrough` で `/session` と `/api/*` を検証する。`loginThrough` は auth の `/login?rid=` に着いたら `/api/login?rid=` で rid と CSRF を受け取り、フォーム POST で `/login` に送る |
| Chrome 確認 | `scripts/chrome-check.ts` は auth-web の SPA が `/api/login` を読んで「Sandbox にログイン」を描くまで待ってからフォームを埋める。ポータルは「Sandbox ポータル」、ログアウト確認は「ログアウトする」、完了は「Sandbox からログアウトしました」の文字列を待つ |
| api インスタンス | サービスごとに別インスタンス。`apps/crm-api/src/test-support.ts` と `apps/cms-api/src/test-support.ts` が実物の定義と routes で組み立て、web-core の harness もこれを使う。API_BASE_URL は http://api.crm.localhost:3002 / http://api.cms.localhost:3004 |
| テストファイル | `apps/auth-api/src/app.test.ts`、`apps/auth-api/src/usecases/authorization-request.test.ts`、`apps/crm-api/src/app.test.ts`、`apps/cms-api/src/app.test.ts`、`packages/web-core/src/app.test.ts`、`packages/shared/src/` の `encryption` `jwks` `jwt` `kv-store` `random` `redirect-template` `redis-store` `return-to` `secret-hash` の各 `.test.ts` |
| 署名鍵 | テスト用 RSA 鍵ペアを固定生成 |
| 時刻 | 注入可能なクロックで期限切れを再現 |

## カバレッジ目標

| 対象 | 目標 |
| --- | --- |
| Auth Server の認可 / Token ロジック | 90% 以上 |
| Tenant OIDC Client モジュール | 90% 以上 |
| API 認可ミドルウェアと Repository | 90% 以上 |
| 全体 | 80% 以上 |

## フェーズ別の完了条件

| フェーズ | 通すテスト |
| --- | --- |
| 2. Auth Server | Auth の Unit / Integration |
| 3. Tenant Web Application | E1 / E2 / E8 / E9 / E12 |
| 4. API Server | E4 / E10 / E13 / P 系 / S7-S10 / S16 / S19-S20 / S24 |
| 5. Logout とエラー | E3 / E5-E7 / 全エラーケース / S1-S6 / S11-S15 / S17-S18 |
| 6. 拡張 | E11 / MFA シーケンス |
| 7. サービスごとの DB と招待 | E15 / Q 系 / R 系 / S21-S23 |
