# セキュリティ設計

## 結論

仕様書20章の必須要件をすべて設計上の具体的な対策に対応付ける。
防御は「境界を越える値を最小化する」「値を検証してから使う」「多層で拒否する」の3原則で構成する。

## 要件対応表

| 要件 | 対策 | 記載箇所 |
| --- | --- | --- |
| HTTPS | 全ホストで TLS 必須。HSTS を有効化。HTTP は 301 ではなく拒否 | インフラ |
| Secure / HttpOnly Cookie | 全認証 Cookie に付与。`__Host-` プレフィックスで強制 | 03 |
| SameSite | Lax。None は禁止 | 03 |
| Authorization Code 短命 | 60秒 | 04 |
| Authorization Code 一回限り | GETDEL によるアトミック消費。再利用検知で系列失効 | 04, 05 |
| redirect_uri 厳格検証 | サービスの `redirect_uri_template` を slug で展開した文字列と完全一致。slug が tenants になければ不一致。不一致時はリダイレクトしない | 06 |
| state による CSRF 対策 | pre-auth に保存し callback で一致検証 | 02, 06 |
| nonce 検証 | ID Token の nonce と pre-auth の一致検証 | 04 |
| Open Redirect 対策 | redirect_uri はテンプレート展開値と完全一致。return_to は自ドメイン内パスのみ。Global Logout の戻り先もテンプレートから導く | 06, 10 |
| Session Fixation 対策 | 認証成功時と code 交換成功時にセッション ID を新規発行 | 03 |
| Token / Cookie のログ出力禁止 | ログフィールドの許可リスト方式。秘密値は型でマーク | 本書 |
| Cognito Refresh Token のサービス間共有禁止 | Auth Server 内で暗号化保存。境界外へ出す経路を持たない | 04 |
| Cognito Token の URL 埋め込み禁止 | Front Channel を通る値は code と state のみ | 02 |
| Tenant ID だけを根拠にした認可禁止 | Token の tenant_id と sub で自サービス DB の members を読む。リクエストの tenant_id は使わない | 07 |
| サービスへの割り当てによる認可 | Auth Server が Token 発行時と Refresh 時に割り当てを検証。役割と権限の上書きは自サービス DB を毎リクエスト参照。Token には役割も権限も載せない | 07 |
| BOLA / IDOR 対策 | Repository の tenant_id 必須化と RLS | 07 |
| サービスからの招待 | 管理 API は client_secret_basic で Client を認証し、その Client のサービスへの割り当てだけを操作させる | 本書 |
| 監査イベント | SSO Session の作成、`/authorize` の到達、失効、再利用検知、招待と解除、MFA を Identity DB の `audit_events` に残す。Token 値、Cookie 値、パスワード、TOTP の secret は残さない | 本書, 05 |
| 環境の記録と変化 | ブラウザの IP と User-Agent を `auth_sessions` に記録し、前回と違えば `environment_changed` を監査して警告ログを出す。それだけでは失効させない | 本書, 05 |
| セッション一覧と失効 | 本人がポータルの `/security` で自分のセッションを見て、他の端末を失効できる。失効は Global Logout と同じ手順 | 本書, 10 |
| 招待解除の即時失効 | 割り当てを消すと同時に、そのサービスとテナントの Refresh Token 系列を失効させ、そのサービスへ Back-Channel Logout を送る | 本書, 10 |
| ストアのキーのハッシュ | Cookie の値、Refresh Token、認可コード、rid、CSRF の参照 ID、MFA の保留 ID は SHA-256 をキーにし、値にも生の秘密値を持たない | 本書, 05 |
| MFA の必須化 | 全員必須。初期方式は認証アプリの TOTP。パスワード認証だけでは SSO Session を作らず、登録済みの人にはコードを、未登録の人には登録を求める。Cognito は OPTIONAL にし、必須化は Auth Server が行う | 本書, 02 |

## 脅威と対策

### 認可フロー

| 脅威 | 対策 |
| --- | --- |
| code 横取り | PKCE S256 必須。code 60秒。client_secret による Client 認証 |
| code 注入。攻撃者の code を被害者のセッションへ | state の一致検証。nonce の一致検証 |
| 認可レスポンスの差し替え | state を pre-auth に紐付け、Cookie で参照 |
| redirect_uri 操作 | テンプレート展開値との完全一致。パラメータ付き、パス違い、末尾スラッシュ、大文字、多段ラベル、未知の slug をすべて拒否 |
| Client なりすまし | client_secret_basic。client_secret は 32 バイト以上の乱数で、DB には SHA-256 ハッシュのみ保存 |
| mix-up 攻撃。複数 IdP 想定 | iss パラメータをレスポンスに含める。RFC 9207。Client は iss を検証 |
| サービス越境の code 交換 | code.client_id と認証 Client の一致検証 |
| テナント越境の code 受け取り | code.redirect_uri の完全一致検証。ID Token の tenant_slug と Host の一致検証 |
| 契約外サービスへのアクセス | `/authorize` と Refresh で tenant_services を検証。redirect_uri がテンプレートに一致し slug が既知でも契約がなければ access_denied |

### セッション

| 脅威 | 対策 |
| --- | --- |
| Session Fixation | 認証成功時に ID 再発行 |
| 再ログイン時の旧セッション残留 | `POST /login` 成功時に、Cookie が指す旧 SSO Session をストアから破棄してから新しい Cookie を書く。Cookie の上書きだけでは旧セッションが期限まで有効なまま残る |
| Session Hijack | HttpOnly / Secure / `__Host-`。値はランダム 256bit |
| 長期放置 | アイドルと絶対の二重タイムアウト |
| Cookie のサブドメインからの上書き | `__Host-` により Domain 指定を不可能にする |
| CSRF。ログイン POST / 認証コードの POST / Logout POST | 同期トークン方式。Cookie 参照 ID とフォーム値の一致。比較は `timingSafeEqualString`。トークンは auth-web の SPA が `/api/login` `/api/login/challenge` `/api/login/mfa-setup` `/api/logout` で受け取り、hidden に入れてフォーム POST する |
| auth の SPA からの資格情報送信 | パスワードは fetch で送らず、HTML フォームの POST で `/login` へ送る。SPA は `/api/login` で `rid` と CSRF を受け取ってフォームを描くだけ。失敗は `/login?error=<kind>` へ 303 で戻し、ユーザー名やパスワードを URL に載せない |
| auth の `/api/*` の悪用 | `/api/login` `/api/login/challenge` `/api/login/mfa-setup` `/api/portal` `/api/logout` `/api/sessions` は GET のみの JSON で `Cache-Control: no-store`。Token を返さず、`/api/portal` と `/api/sessions` は SSO Session がなければ 401。`/api/login` `/api/login/*` と `/api/logout` `/api/sessions` は `/login` `/logout` と同じレート制限。`/api/login/mfa-setup` が返す secret は保留状態の `mid` を知るブラウザにしか届かず、3 分で失効する |
| 別の端末からの SSO Session の乗っ取り | SSO Session の作成時と `/authorize` の到達時にブラウザの IP と User-Agent を `auth_sessions` に記録し、前回と違えば `environment_changed` の監査イベントと警告ログを出す。自動失効はしない。モバイル回線やブラウザ更新で正規の利用者が落ちることを避けるためで、Refresh Token の再利用のような強い侵害シグナルだけを即時失効にする。Refresh はサーバー間通信で端末の環境を運ばないため比較しない |
| 見覚えのない端末のセッション | 本人が `/security` で `auth_sessions` と `auth_session_clients` から作った一覧を見て、他の端末を `POST /sessions/revoke` で失効できる。失効は Global Logout と同じ手順で、Refresh Token 系列、Cognito の Refresh Token、SSO Session、Back-Channel Logout まで行い、理由 `user_revoked` で監査する |
| セッション失効 POST の悪用 | `/sessions/revoke` は同期トークン必須で、`/api/sessions` が Cookie とトークンを発行する。対象は自分の sid だけで、他人の sid や自分の現在のセッションを指定しても何も起きず `/security` へ 303 する |
| CSRF。SPA から `/api/*` への書き込み | `/session` で渡した CSRF トークンを `X-CSRF-Token` ヘッダで要求し、GET / HEAD / OPTIONS 以外で不一致なら 403。body は JSON のみで、フォーム送信では通らない |
| Login CSRF | ログインフォームの同期トークン。rid との紐付けと使用時の消費は未対応で、テナント側の state 検証が code の差し替えを止める |
| lastSeenAt 更新による Token の巻き戻し | Tenant 側の `touchSession` は書く直前にセッションを読み直し、並行する Refresh が更新した Token を古い値で上書きしない |

### Token

| 脅威 | 対策 |
| --- | --- |
| Token 漏洩 | ブラウザに置かない。サーバー側ストアのみ。SPA に渡す `/session` は Token を含まず、API は BFF の `/api/*` が中継する |
| 揮発ストアの読み取り漏洩 | auth-api のストアのキーは Cookie の値、Refresh Token、認可コード、rid、CSRF の参照 ID、MFA の保留 ID の SHA-256 で、値にも生の秘密値を持たない。MFA の保留状態が持つ Cognito の Token と登録中の secret は暗号化済み。Redis のダンプや `KEYS` の出力から提示できる値を復元できない。`packages/shared` の `keyDigest`、`application/usecases/store-keys.ts` の `keyOf` |
| Refresh Token 再利用 | ローテーションと系列失効。消費は GETDEL で先に行い、直後に `rotated` として書き戻す。`rotated` / `revoked` の値が提示されたら系列全体を失効し、`refresh_token_reused` を監査する |
| Refresh Token の同時提示 | 同じ値を同時に 2 回提示しても、GETDEL で取り出せるのは 1 回だけ。成功は 1 つで、もう一方は `invalid_grant`。系列は失効しないため、正規の Client が続行できる |
| 別 Client からの Refresh Token 提示 | client_id 不一致は漏洩とみなし `client_mismatch` として系列全体を失効し、`refresh_token_client_mismatch` を監査する |
| Tenant 側の Refresh 二重送信 | `ensureFreshAccessToken` がセッション単位のロックを取り、同時リクエストはロック保持者の結果を待って再読込する。Refresh Token を二重に送らない |
| 鍵漏洩 | 秘密鍵は Auth Server のみ。Secret Store から起動時読み込み。ローテーション手順を定義 |
| alg 混同 | 検証時に alg を RS256 に固定。none と HS256 を拒否 |
| aud 取り違え | ID Token と Access Token で aud を分ける。API は `API_BASE_URL` を aud として必ず検証し、Host が異なれば 404 |
| サービス越境の Access Token | Access Token の aud はサービスの API origin。CRM の Token は api.cms で 401 |
| Cognito Token の露出 | 保存時暗号化。ログ禁止。応答に含めない |

### テナント分離

| 脅威 | 対策 |
| --- | --- |
| Tenant ID 改ざん | Token 以外の tenant_id を認可に使わない |
| IDOR / BOLA | 単一リソース取得も tenant_id 条件付き。RLS |
| 権限昇格 | role は自サービス DB の members から毎回取得。permission は役割の既定と permission_overrides から毎回確定し、deny が優先。Token の role や permissions は無視。語彙にない role や permission は 400 |
| 別サービスの割り当てでの越境 | 割り当ては (tenant, service, user) の単位。Auth Server は認可リクエストの client_id に一致する割り当てだけを見る。tenant_members の会社横断の役割ではログインできない。API の aud がサービスごとに違うため、別サービスの Token では API に入れない |
| 別サービスの DB への到達 | DB がサービスごとに分かれ、接続情報も別。crm-api は cms の DB に接続できない |
| 退会済みユーザーのアクセス | 割り当ての解除でそのサービスとテナントの Refresh Token 系列を即時に失効させ、Back-Channel Logout で Tenant Session を消す。`/authorize` と Refresh でも再検証する。発行済みの Access Token は寿命の 15 分まで残る。サービス側で members.status を disabled にすれば次のリクエストから 403 |
| 停止テナントへのアクセス | tenants.status を `/authorize` と Refresh で確認 |
| 契約解除後のアクセス | tenant_services を `/authorize` と Refresh で確認。Access Token 寿命の 15 分以内に失効 |
| 同一テナントの別サービスへの Cookie 流用 | tanaka.crm と tanaka.cms は別ホスト。Cookie は届かず、Session Store のキーも clientId で分かれる |
| 表の所有者による RLS の回避 | サービスの DB の表は postgres が所有し、アプリのロールは NOBYPASSRLS の利用者。FORCE ROW LEVEL SECURITY が所有者に効かないため、所有者とアプリのロールを分ける |
| 自分自身の管理権限の喪失 | `DELETE /v1/members/:userId` は自分自身を拒否する。owner が自分を消して管理者不在になることを防ぐ |

### 並行性

同じ値を同時に提示されたときに二重に成功させないこと、並行更新で一覧の要素を落とさないことをストアの操作で保証する。`packages/shared/src/kv-store.ts`。

| 脅威 | 対策 |
| --- | --- |
| code / Refresh Token の同時提示 | 一回限りの消費は `KeyValueStore.getAndDelete` だけで行う。Redis は GETDEL、インメモリは await を挟まず読んで消す。読んでから別の呼び出しで消す手順を持たない |
| 一覧の read-modify-write による要素の欠落 | Refresh Token 系列、sid に紐付く系列、sid に紐付く Tenant Session は `SetStore` に置く。SSO Session が code を発行したサービスは Identity DB の `auth_session_clients` に upsert する。Redis は SADD / SREM / SMEMBERS で、2 つの追加が同時に走っても片方が消えない |
| Refresh の二重実行 | `KeyValueStore.setIfAbsent` で SET NX のロックを取る。Tenant 側の Refresh ロックに使う |
| レート制限カウンタの競合 | `CounterStore.increment` は INCR と EXPIRE NX で加算と TTL 付与を行う |

Refresh Token のローテーションは consume-first で行う。`consumeRefreshToken` が GETDEL で取り出し、直後に `rotated` として書き戻してから検証と新 Token の発行に進む。`active` でない値を取り出した場合はその値を書き戻して再利用として報告する。この順序により、同じ値を同時に 2 回提示されても GETDEL で取り出せるのは 1 回だけになり、もう一方は `invalid_grant` になる。系列は失効させない。正規の Client が偶発的に二重送信しただけで全セッションが落ちることを避けるためで、失効させるのは `rotated` / `revoked` の値が明示的に提示された場合と、別 Client からの提示に限る。

Tenant 側の `ensureFreshAccessToken` はセッション単位のロック `<tenantSlug>:<sessionId>` を `setIfAbsent` で取り、TTL は `REFRESH_LOCK_TTL_SECONDS` の 10 秒。取得後にセッションを読み直し、別のリクエストが更新済みならそれを使う。取れなかったリクエストは 100 ミリ秒間隔で最大 30 回セッションを読み直し、Refresh 済みになれば続行する。Refresh Token が一回限りであるため、二重に送ると Auth Server が再利用とみなして系列を失効させる。ロックはそれを防ぐ。

### ログインエンドポイント

| 脅威 | 対策 |
| --- | --- |
| パスワードスプレー / ブルートフォース | IP 単位と IP × ユーザー名でレート制限。本書のレート制限を参照。Cognito 側のロックアウトも併用 |
| ユーザー列挙 | 失敗理由を統一メッセージにする。`invalid_credentials` と `user_disabled` は `/api/login` が同一文言を返す。応答時間を揃える |
| 資格情報の平文送信 | USER_SRP_AUTH。USER_PASSWORD_AUTH を無効化 |
| 巨大な body によるメモリ消費 | 全ルートで body を 16 KB に制限。フォームと Token リクエストは数 KB で足りる |
| Basic 資格情報の不正なパーセントエンコード | デコード失敗を `invalid_client` にする。500 にしない |
| Clickjacking | `X-Frame-Options: DENY` と `frame-ancestors 'none'` |

### MFA

判断事項D22。定義は `apps/auth-api/src/domain/policy.ts` の `MFA_PENDING_TTL_SECONDS` `TOTP_SETUP_TTL_SECONDS` `MFA_ISSUER_NAME`、判定は `application/usecases/mfa.ts`。

| 脅威 | 対策 |
| --- | --- |
| パスワードだけでのログイン | 全員必須。`POST /login` はパスワード認証の結果を保留状態にするだけで SSO Session を作らない。SSO Session は `POST /login/challenge` か `POST /login/mfa-setup` で認証アプリのコードが通ったときだけ作る。登録していない人は登録画面へ送り、登録が終わるまで先へ進めない |
| Cognito 側の設定だけに頼る必須化 | User Pool は OPTIONAL にし、必須化は Auth Server が行う。Cognito を ON にすると未登録の人に MFA_SETUP チャレンジが返り、QR の期限と再発行、将来のテナント別の方針を Auth Server で扱えない。登録済みの人には Cognito が SOFTWARE_TOKEN_MFA のチャレンジを返すため、Cognito だけを見ても登録済みの人は MFA なしで通れない |
| 初期方式 | 認証アプリの TOTP。RFC 6238、HMAC-SHA1、6 桁、30 秒。Cognito の SOFTWARE_TOKEN_MFA で検証し、Auth Server は本番でコードを検証しない。モックは `packages/shared/src/totp.ts` で本物の検証を行う |
| 保留状態の放置 | 保留状態は `mid` の SHA-256 をキーに 5 分で消える。`mid` は 256bit の乱数で URL のクエリにだけ載り、Cookie には入れない。期限を過ぎたコードの送信は `/login?error=challenge_expired` へ戻し、パスワードからやり直させる |
| 登録中の secret と QR の放置 | secret は Auth Server が 3 分で失効させ、期限が来たら AssociateSoftwareToken をやり直して新しい secret を出す。期限切れの secret で作ったコードは Cognito に送らず `setup_expired` で返す。置き換えたときは `mfa_setup_expired` を監査する。secret は暗号化して保留状態に置き、応答以外には出さない。DB には方式と日時だけを残す |
| コードの総当たり | `/login/*` と `/api/login/*` は `/login` と同じ IP あたり 60 回/分のレート制限。保留状態は 5 分で消え、`attempts` を数えて `mfa_challenge_failed` を監査し警告ログに出す。Cognito 側の Session も短命で、コード不一致以外の失敗は保留状態を消す |
| 認証アプリの登録の横取り | 登録は `POST /login` を通ったブラウザの `mid` に紐付き、パスワード認証で得た Cognito の Access Token で AssociateSoftwareToken と VerifySoftwareToken を呼ぶ。コードが通ってから SetUserMFAPreference で TOTP を必須にするため、途中で放置しても Cognito 側は未登録のまま残る |
| コード不一致からのユーザー列挙 | コード不一致の文言は登録済みでも登録中でも同じ「コードが正しくありません」。`mfa_challenge_failed` はユーザー名を残さない |

### Back-Channel Logout

| 脅威 | 対策 |
| --- | --- |
| 通知先が応答しない | `fetch` に `AbortSignal.timeout(5000)` を付ける。`BACKCHANNEL_TIMEOUT_MS`。1 サービスの停止が Global Logout 全体を止めない |
| 停止した Client への送信 | `oidc_clients.status` が `active` でない Client と `backchannel_logout_uri` を持たない Client は通知対象から外す |
| 無認証エンドポイントへの書き込み増幅 | `/auth/backchannel-logout` は IP あたり 60 回/分に制限し、body を 16 KB に制限 |

### 管理 API と招待

| 脅威 | 対策 |
| --- | --- |
| 管理 API の無認証呼び出し | `/admin/*` は client_secret_basic を要求し、`/token` と同じ `authenticateClient` で active な secret と照合する。失敗は 401 `invalid_client` と `WWW-Authenticate: Basic realm="admin"` |
| 別サービスの割り当ての操作 | 操作対象の oidc_client_id は認証した Client 自身。リクエストで指定させない。crm の secret で cms への割り当ては作れない |
| 契約のないテナントへの招待 | tenant_services が active でなければ 403 `not_contracted`。tenant_service_members の複合外部キーでも DB 層で拒否される |
| 管理 API の連打 | `/admin/*` に `/token` と同じ IP あたり 300 回/分のレート制限。body は 16 KB |
| 招待メールの乗っ取り。同じメールで別の Cognito ユーザーがログイン | users.email は UNIQUE。初回ログイン時に同じメールの行が既に別の cognito_sub に紐付いていれば、既存行を書き換えず新規行も作らずログインを拒否する。紐付けるのは cognito_sub が NULL の行だけ |
| 招待で存在しないテナントや人を探る | tenant_not_found と user_not_found は 404 で、Client 認証済みのサービスにしか返さない |
| サービス側だけに member 行が残る | 招待は Auth Server を先に呼び、拒否されればサービスの DB に書かない。削除は Auth Server を先に呼び、`user_not_found` でも自 DB の行は消す |
| API から Auth Server への通信失敗 | 5 秒でタイムアウトし 503 `temporarily_unavailable`。招待は再試行で冪等。upsert のため二重に作られない |
| 招待解除後もアクセスが残る | `DELETE /admin/service-members` は割り当てを消したあと、その人の active な SSO Session のうち `auth_session_clients` にそのサービスとテナントがあるものについて、そのサービスとテナントの Refresh Token 系列を失効させ、そのサービスへ Back-Channel Logout を送る。SSO Session と他のサービスの系列は残す。`service_member_revoked` に対象の sid を残す。有効な Access Token は寿命の 15 分まで残る |

### 監査イベント

Identity DB の `audit_events` に残す。定義は `apps/auth-api/src/domain/audit.ts`、記録は `application/usecases/audit.ts` の `recordAudit`。

| kind | いつ | 残すもの |
| --- | --- | --- |
| `login_succeeded` | MFA を終えてログインが成功したとき。`POST /login/challenge` か `POST /login/mfa-setup` | user_id、sid、IP、User-Agent、detail に `{mfa: "totp"}` |
| `login_failed` | `POST /login` の失敗 | 理由コードと IP、User-Agent。ユーザー名は残さない。列挙の材料になるため。users.status が disabled のときだけ user_id |
| `environment_changed` | `/authorize` の到達で IP か User-Agent が前回と違う | 前回と今回の IP と User-Agent、tenant_id、client_id |
| `global_logout` | Global Logout | 通知に成功したサービスと失敗したサービス |
| `session_revoked` | ポータルからの sid 指定の失効 | 理由と通知の結果 |
| `refresh_token_reused` | rotated / revoked の Refresh Token の提示 | familyId、Token の client_id、提示した client_id |
| `refresh_token_client_mismatch` | 別 Client からの Refresh Token の提示 | 同上 |
| `authorization_code_reused` | 使用済み code の提示 | familyId、提示した client_id |
| `service_member_invited` | `POST /admin/service-members` | user_id、tenant_id、client_id、初回ログイン済みか |
| `service_member_revoked` | `DELETE /admin/service-members` | user_id、tenant_id、client_id、失効させた sid の一覧 |
| `mfa_enrolled` | `POST /login/mfa-setup` で認証アプリの登録を終えたとき | user_id、sid、IP、User-Agent、detail に `{method: "totp"}` |
| `mfa_challenge_failed` | 認証アプリのコードが一致しなかったとき。チャレンジと登録の両方 | IP、User-Agent、detail に `{method: "totp", attempts}` か `{method: "totp", phase: "setup"}`。ユーザー名は残さない |
| `mfa_setup_expired` | 期限切れの secret を新しい secret で置き換えたとき | detail に `{method: "totp", renewed: true}` |

`environment_changed` `refresh_token_reused` `refresh_token_client_mismatch` `authorization_code_reused` `mfa_challenge_failed` は侵害の兆候になりうる種類で、警告ログにも出す。それ以外は情報ログ。記録の失敗はエラーログに出すだけで、ユーザーの操作を止めない。Token 値、Cookie 値、code、パスワード、TOTP の secret は detail に入れない。

## HTTP セキュリティヘッダ

auth.sandbox.com と `<tenant>.<service>.sandbox.com` に共通で付与する。

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store   (認証関連レスポンス)
```

`<tenant>.<service>.sandbox.com` は `form-action 'self'` を追加してよい。フォームの送信先も送信後のリダイレクト先も自ホストに閉じるため。

`<tenant>.<service>.sandbox.com` の CSP は SPA の配り方で `script-src` と `connect-src` が変わる。

| 配り方 | `script-src` | `connect-src` |
| --- | --- | --- |
| 静的配信。`SPA_DIR` | `'self'` と `index.html` のインラインスクリプトの `'sha256-...'`。`'unsafe-inline'` は使わない | `'self'` |
| 開発時の中継。`SPA_DEV_SERVER_URL` | `'self' 'unsafe-inline'` | `'self'` と Vite の origin と ws origin。HMR 用 |

中継は開発専用で、`PUBLIC_SCHEME=https` では `SPA_DIR` を必須にして中継で起動できないようにする。`style-src` は `'self' 'unsafe-inline'`、`img-src` は `'self' data:`、`base-uri` は `'self'`。

auth.sandbox.com も auth-web の SPA を配るため同じ形の CSP になる。`script-src` と `connect-src` は `packages/shared/src/spa.ts` の `spaCsp` が決め、静的配信では `'self'` と `index.html` のインラインスクリプトの sha256 ハッシュ、開発時の中継では `'unsafe-inline'` と Vite の origin。`img-src` は `'self' data:`、`frame-ancestors` は `'none'`。https の `ISSUER` では `SPA_DIR` を必須にして中継で起動できないようにする。

auth.sandbox.com には `form-action` を付けない。Chrome はフォーム送信後のリダイレクト先にも `form-action` を適用するため、ログイン POST から各テナント × サービスの redirect_uri への 303 がブロックされる。redirect_uri はテンプレートとテナントの組み合わせで動的に増えるため列挙できない。ログインフォームの CSRF は同期トークンで防ぐ。

`/token` `/userinfo` `/revoke` の応答と、auth-web 向けの `/api/login` `/api/login/challenge` `/api/login/mfa-setup` `/api/portal` `/api/logout` `/api/sessions` の応答には `Cache-Control: no-store` を付ける。`/api/*` は GET のみで、資格情報は受け取らない。

## ログとシークレット

- ログは構造化し、出力するフィールドを許可リストで定義する
- Token、Cookie 値、code、client_secret、パスワードは秘密値型で扱い、シリアライザで自動的に `[REDACTED]` にする
- 認証イベントは user_id / client_id / tenant_id / 結果 / 理由コード / IP / User-Agent を Identity DB の `audit_events` に監査イベントとして残し、同じ内容を構造化ログにも出す。運用ログは保持期間で消えるが、`audit_events` は残る
- Cognito API の例外メッセージをそのままユーザーへ返さない

## シークレット管理

| シークレット | 保管 | ローテーション |
| --- | --- | --- |
| Auth Server 署名鍵 | Secret Store | JWKS 併存方式。04参照 |
| Cognito App Client Secret | Secret Store | Cognito 側で再生成後に差し替え |
| client_secret | Secret Store。DB は oidc_client_secrets に `sha256$<base64url>` のハッシュ。サービスごとに active な行を複数持てる | 新 secret を active で追加 → サービスの `CLIENT_SECRET` を差し替え → 旧行を revoked。切替中は新旧どちらも `/token` で受け付ける |
| Cognito Token 暗号化鍵 | Secret Store | 鍵 ID をレコードに保存し、旧鍵で復号できるようにする |
| Session Store 接続情報 | Secret Store | |

client_secret のハッシュに KDF を使わない理由。client_secret は人が選ぶパスワードではなく 32 バイト以上の乱数なので、辞書攻撃への耐性を KDF で補う必要がない。scrypt は `/token` のたびに数十ミリ秒イベントループを止め、Refresh が集中する時間帯に Auth Server 全体の応答を遅らせる。SHA-256 ならハッシュ計算はマイクロ秒で終わり、比較は `timingSafeEqual` で行う。乱数長の要件を満たさない secret を登録しないことが前提になるため、長さを起動時に強制する。`*-web` の `CLIENT_SECRET` と provision の `SERVICES[].clientSecret` は 43 文字以上でなければ起動に失敗する。32 バイトの乱数を base64url にした長さで、ローカルの固定値もこの長さを満たす。

## 設定ガード

Cookie の Secure と `__Host-` を外せる設定値を持たない。公開 scheme から導く。

| アプリ | 導出 | https のときの必須条件 |
| --- | --- | --- |
| auth-api | `cookieSecure = ISSUER が https:// で始まる` | `SIGNING_KEY_PEM`、`REDIS_URL`、`COGNITO_ADAPTER=sdk`、`SPA_DIR`。欠けると起動に失敗する |
| crm-web / cms-web | `cookieSecure = PUBLIC_SCHEME === "https"` | `REDIS_URL` と `SPA_DIR` が設定され、`ISSUER` と `API_BASE_URL` が https。欠けると起動に失敗する |

https で公開する構成で、起動ごとに生成される署名鍵、インメモリのセッション、モックの Cognito をそのまま使えないようにするための制約。ローカルの http では制約を課さない。

## レート制限

固定窓。`packages/shared/src/rate-limit.ts` の `rateLimit` ミドルウェアで、キーは `X-Forwarded-For` の先頭、なければ接続元アドレス。超過時は 429 と `Retry-After` を返す。カウンタは `CounterStore` に置き、Redis なら複数プロセスで共有される。ALB のような信頼できるプロキシの背後で動かす前提で、直接公開する場合はヘッダを信用しない構成にする。

| アプリ | エンドポイント | 制限 | 定義 |
| --- | --- | --- | --- |
| auth-api | `/login` `/login/challenge` `/login/mfa-setup` の全メソッドと `GET /api/login` `GET /api/login/challenge` `GET /api/login/mfa-setup` | IP あたり 60 回/分。同じカウンタ | `RATE_LIMITS.login` |
| auth-api | `POST /login` | IP × ユーザー名あたり 10 回/分 | `RATE_LIMITS.loginPerUser` |
| auth-api | `/authorize` | IP あたり 120 回/分 | `RATE_LIMITS.authorize` |
| auth-api | `/token` | IP あたり 300 回/分 | `RATE_LIMITS.token` |
| auth-api | `/admin/*` | IP あたり 300 回/分 | `RATE_LIMITS.token` を流用。サービスのサーバーから来るため `/token` と同じ |
| auth-api | `/logout` と `GET /api/logout`、`GET /api/sessions` と `POST /sessions/revoke` | IP あたり 60 回/分。同じカウンタ | `RATE_LIMITS.login` を流用 |
| crm-web / cms-web | `/auth/*` | IP あたり 60 回/分 | `AUTH_ROUTE_RATE_LIMIT` |
| crm-web / cms-web | `/auth/backchannel-logout` | IP あたり 60 回/分 | `AUTH_ROUTE_RATE_LIMIT` |

定義は `apps/auth-api/src/policy.ts` と `packages/oidc-client/src/types.ts`。`/token` は Client のサーバーから来るため IP 単位で緩く、`/login` はブラウザから来るため厳しくしている。

## body の上限

| アプリ | 範囲 | 上限 |
| --- | --- | --- |
| auth-api | 全ルート | 16 KB |
| crm-web / cms-web | `/auth/*` と `/auth/backchannel-logout` | 16 KB |
| crm-web / cms-web | `/api/*` | 64 KB。中継先の API と同じ |
| crm-api / cms-api | 全ルート | 64 KB |

Hono の `bodyLimit` を使う。フォーム、Token リクエスト、logout_token は数 KB で足りる。業務 API は CMS の投稿本文を含むため 64 KB にしており、BFF の `/api/*` も同じ上限にする。

## 未対応

判断済みで、現時点では実装していない項目。

- 招待した人への通知メールは送っていない。招待された人は自分で Cognito のアカウントを持ち、サービスの URL を開く必要がある
- 招待の解除で失効させた Access Token は寿命の 15 分まで有効。API 側は Token の失効リストを持たず、Tenant Session を Back-Channel Logout で消すことで BFF がその Token を使えなくする
- 環境の変化は記録と警告に留め、自動失効やリスクベースの再認証は行っていない。`environment_changed` の detail は将来のリスクベース認証が読める形で残している
- logout_token は `sub` に sid を入れ、`typ` が `logout+jwt` ではなく `JWT` になっている
- ログインフォームの CSRF トークンは rid に紐付かず、使用時に消費しない。テナント側の state 検証が補っている
- 認可レスポンスの `iss` は存在する場合だけ検証している。Discovery の `authorization_response_iss_parameter_supported` を読んで必須化すればダウングレードを塞げる
- logout_token の jti リプレイは記録していない。リプレイしても冪等な Logout が繰り返されるだけ
- 認証アプリを失った人の再登録とリカバリーコードは未実装。Cognito 側でその人の TOTP を無効にすれば、次のログインで Cognito がチャレンジを返さなくなり登録画面から始まる。テナント単位の MFA 方針も未実装で、全員必須のみ

## 依存関係と運用

- JWT ライブラリは jose 等の標準準拠実装を使い、自前実装しない
- 暗号乱数は `crypto.randomBytes` / `crypto.getRandomValues` のみ
- 依存パッケージの脆弱性スキャンを CI に組み込む
- 認証イベントのメトリクスを監視する。401 / 403 の急増、Refresh 再利用検知、code 再利用検知、環境の変化。`audit_events` の kind ごとの件数と警告ログを見る
