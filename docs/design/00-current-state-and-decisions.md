# 現状分析と判断が必要な事項

## 結論

本リポジトリは新規サンドボックスであり、既存の認証実装・DB・インフラは存在しない。
したがって仕様書22章の調査対象はなく、24章の「現状分析 / 現在の認証フロー / 現在の問題点 / 移行計画」はグリーンフィールド前提で記述する。
推奨アーキテクチャは OIDC Authorization Code Flow + PKCE を用いた独立OpenID Provider方式とし、Tenant Web ApplicationはBFF構成とする。
OIDC Client はサービス単位で登録し、テナントは顧客としてサービス横断で共有する。テナントがサービスを使えるかは契約で判定する。判断事項D13。
検証実装はサービスごとに web と api のプロセスを持ち、実装は共有パッケージに置く。判断事項D14。
Identity DB の主キーはサロゲート ID、redirect_uri はサービスごとのテンプレート、client_secret は複数行でローテーション可能、ハッシュは SHA-256 とする。判断事項D15。
アーキテクチャを左右する判断が4件ある。以下の「人間の判断が必要な事項」を確認してから実装に進む。

## 1. 現状分析

| 調査項目 | 結果 |
| --- | --- |
| Cognito User Pool構成 | 存在しない。新規作成を前提とする |
| Cognito認証方式 | 未定。USER_SRP_AUTH を推奨 |
| 現在のログイン処理 | 存在しない |
| Cognito Tokenの利用箇所 | 存在しない |
| Cookie設計 | 存在しない |
| Session Store | 存在しない |
| User / Tenant / Membership データモデル | 存在しない。仕様書15章の3テーブルを起点に設計する |
| Tenant Web Application構成 | 存在しない。実行形態が未決定。判断事項D1 |
| API Server構成 | 存在しない |
| Auth Server配置方法 | 未定 |
| DB構成 | 未定。PostgreSQLを想定して設計する |
| CORS / CSRF | 存在しない。BFF構成ならブラウザから API ホストへの直接呼び出しがなくCORSは不要 |
| 現在の認可処理 | 存在しない |

他プロジェクトへ本設計を適用する場合は、上記の表を適用先の調査結果で埋め直し、差分から移行計画を作る。

## 2. 現在の認証フローと問題点

該当なし。新規構築のため、ここでは仕様書が禁止する典型的なアンチパターンを「避けるべき現状」として列挙する。適用先にこれらが存在する場合は移行対象になる。

| アンチパターン | 問題 |
| --- | --- |
| Hosted UIへのリダイレクト | ログインUIと認証フローをSandbox側で制御できない。絶対条件2.1に違反 |
| `Domain=.sandbox.com` の共有Cookie | 別ドメインへ拡張できない。1つのCookie漏洩が全テナントに波及。絶対条件2.2に違反 |
| フロントエンドがCognito JWTを保持しAPIへ送る | XSSでToken漏洩。Cognito Tokenがサービス境界を越える。絶対条件2.3に違反 |
| URLクエリでのToken受け渡し | Refererやログ経由で漏洩 |
| リクエストのtenant_idのみで認可 | IDOR / BOLA。仕様書16章に違反 |

## 3. 推奨アーキテクチャ

詳細は [01-system-architecture.md](./01-system-architecture.md)。要点のみ示す。

| 項目 | 推奨 |
| --- | --- |
| プロトコル | OpenID Connect Authorization Code Flow + PKCE。auth.sandbox.comを独立したOpenID Providerとする |
| Cognitoの位置 | Auth Serverの内部認証バックエンド。Cognito Tokenはauth.sandbox.comの外に出さない |
| Tenant Web Application | BFF構成。サーバー側セッション + Cookie。ブラウザはTokenを持たない |
| Client登録 | サービスごとに1 Client。redirect_uri はサービスごとの `redirect_uri_template` で、テナントは契約 tenant_services でサービスに紐付ける。テナント追加に Client 登録も redirect_uri 登録も不要 |
| テナントアクセス可否 | `/authorize` 時にAuth Serverが user → tenant → 契約 → Membership の順に検証 |
| API認証 | Auth Server発行のAccess Token。JWT RS256。aud=サービスごとのAPI origin。BFFがサーバー間で送信 |
| API認可 | Token検証 → sub / tenant_id取得 → DBでMembership再検証 → Role → データアクセス。Tokenのroleは信用しない |
| Tenant Isolation | Token内tenant_idとリソースのtenant_idの一致をアプリ層で強制。可能ならDB RLSで二重化 |
| Identity DB | users / tenants / tenant_members はAuth Serverが所有。API Serverは読み取り参照 |
| Logout | Tenant Logoutは自セッションのみ。Global LogoutはOIDC Back-Channel Logoutで拡張 |

## 4. 人間の判断が必要な事項

仕様書27章に従い、選択肢と推奨案を示す。D1からD4はアーキテクチャを左右するため、実装前に決定が必要。D5以降は推奨値で進めてよいが確認を求める。

決定状況。2026-09-09 にすべて推奨案で決定した。

| 項目 | 決定 |
| --- | --- |
| D1 | BFF構成 |
| D2 | テナントごとに1 Client。2026-09-11 に D13 で見直し、サービスごとに1 Client へ変更 |
| D3 | Auth Server が Identity DB を所有 |
| D4 | Auth Server 発行の Refresh Token をローテーション |
| D5-D12 | 推奨値どおり |
| 追加 | ID Token の sub は内部の users.id |
| 追加 | 検証実装の Cognito はモックアダプタのみ。本番アダプタは雛形のみ |
| 追加 | 検証実装の DB は PostgreSQL on Docker。RLS を検証する |
| 追加 | MFA はフェーズ2。Global Logout は当初フェーズ2としたが、Tenant Logout 後に再ログインされる挙動が分かりにくいため 2026-09-09 に前倒しで実装 |
| D13 | OIDC Client はサービス単位。テナントは顧客としてサービス横断で共有し、契約 tenant_services で利用可否を判定。2026-09-11 決定 |
| D14 | apps はサービスごとに web と api を 1 組ずつ持ち、実装は packages/web-core と packages/api-core に共有する。auth は auth-api に改名。2026-09-11 決定 |
| D15 | Identity DB の主キーはサロゲート ID。redirect_uri はサービスごとの `redirect_uri_template`。client_secret は oidc_client_secrets に複数行持ちローテーション可能。ハッシュは SHA-256。2026-09-11 決定 |

### D1. Tenant Web Applicationの実行形態

問題点。Tenant Web ApplicationがサーバーサイドセッションをもつBFFか、ブラウザ完結のSPAかで、API認証とCookie設計が根本的に変わる。仕様書4.3は「自サービスセッションの管理」と「自サービスのAPIへのAPIアクセス」をTenant Web Applicationの責務としているが、実行形態は明記していない。

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A. BFF構成。Next.js等のサーバーがセッションを持ち、APIをサーバー間で呼ぶ | ブラウザにTokenを置かない。Cookieだけで完結。CORS不要。仕様書の責務分離にそのまま合致 | Tenant Web Applicationにサーバーが必要 |
| B. SPA + ブラウザ保持Token | サーバーレスで配信できる | Tokenがブラウザに露出しXSSで漏洩。Refresh Tokenの扱いが難しい。API ホストへCORSが必要 |
| C. SPA + API Server独自Cookie | ブラウザにTokenを置かない | API Serverが独自にセッションを持つことになり、もう1つのOIDC Clientとして扱う必要がある。責務境界が曖昧になる |

推奨はA。理由は、仕様書2.3と18章のToken非露出要件と、20章のCookie要件を最も自然に満たすため。本設計書はAを前提に記述している。

### D2. OIDC Clientの登録単位

問題点。テナントが増えるたびにClientを手動登録すると運用が破綻する。一方、ワイルドカードredirect_uriは仕様書11章で禁止されている。

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A. テナントごとに1 Client。テナント作成時に自動登録 | aud=テナントとなりTokenのテナント境界が明確。別ドメインサービス追加と同じ仕組みで扱える。仕様書11章の記述と一致 | Tenant Web Applicationがテナント数分のclient_secretを扱う。Secret Store等での管理が必要 |
| B. Tenant Web Application全体で1 Client。redirect_uriをテナント作成時に列挙追加 | Secretが1つ | 1 Clientが全テナントを代表するためaudでテナントを区別できない。redirect_uriのホストからテナントを推定する独自ロジックが必要 |

当初はAを採用した。その後、複数サービスを1つのAuth Serverで扱う構成に変更した際に、テナントとサービスが直交する軸であることが明確になり、D13でサービス単位のClientへ見直した。Bで懸念した「redirect_uriのホストからテナントを推定する独自ロジック」は、D15でサービスごとの `redirect_uri_template` を導入し、テンプレートを slug で展開した文字列との完全一致検証と同じ処理に吸収した。

### D3. Identity DBの所有者

問題点。users / tenants / tenant_members は、Auth Serverがアクセス可否判定に使い、API Serverが認可に使う。両者から参照されるデータの所有者を決めないと境界が崩れる。

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A. Auth Serverが所有。API Serverは同一DBの読み取り専用ロールで参照 | 認可の根拠データが一元化。Auth Serverは外部依存なしにアクセス可否を判定できる | AuthとAPIがDBを共有する。スキーマ変更時の調整が必要 |
| B. API Serverが所有。Auth Serverは内部APIでMembershipを問い合わせる | 業務データとしてのテナント管理がAPI側で完結 | Auth ServerがAPI Serverの可用性に依存。ログインがAPI障害で止まる |
| C. 独立したIdentityサービスを新設 | 境界が最も明確 | 構築コストが高い。初期段階では過剰 |

推奨はA。理由は、ログイン可否の判断を認証基盤の内側で閉じられ、仕様書21章の境界を守りつつ構築コストを抑えられるため。テナントの業務属性はAPI Server側の別テーブルで `tenant_id` を参照する形にし、識別に必要な最小限のみIdentity DBに置く。

### D4. Access Tokenの更新方式

問題点。Access Tokenは短命にするため、Tenant Web Applicationのセッション中に期限切れになる。更新手段を決める必要がある。

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A. Auth Serverが自前のRefresh Tokenを発行。BFFがサーバー側セッションに保存しローテーションしながら更新 | 標準のrefresh_token grant。ユーザー操作なしで更新 | Refresh Tokenの保護とローテーション実装が必要 |
| B. 期限切れごとにSSOで再度 `/authorize` を通す | Refresh Tokenを持たない | 画面遷移が発生する。API呼び出し中に更新できない |

推奨はA。Cognito Refresh Tokenではなく、Auth Serverが発行するRefresh Tokenである点が重要。Cognito Refresh TokenはAuth Serverの内部に留まる。

### D5. Cognito App Clientの認証設定

推奨。USER_SRP_AUTH を有効化し、App Clientはsecret付きで作成する。Auth Serverはサーバーサイドで SECRET_HASH を計算して呼び出す。USER_PASSWORD_AUTH はパスワードを平文でCognitoへ送るため無効化する。MFAはフェーズ2で対応し、初期はチャレンジが返ったらエラー扱いにする。

### D6. セッション寿命

推奨値。SSO Sessionはアイドル2時間 / 絶対12時間。Tenant Sessionはアイドル30分 / 絶対12時間。Access Tokenは15分。Authorization Codeは60秒。業務要件に応じて調整する。

### D7. Session Store

推奨。Redis。ローカル検証ではインメモリ実装で代替する。

### D8. Roleモデル

推奨。初期は `owner` `admin` `member` `viewer` の固定enum。細粒度権限はAPI Server側のRole→Permissionマッピングで表現し、DBにはroleのみ保存する。

### D9. ユーザーとMembershipの自動作成

推奨。usersはCognito認証成功時にJIT作成する。tenant_membersは自動作成しない。招待フローは本設計のスコープ外とし、初期はシード投入で代替する。

### D10. アクセス権のないテナントへのアクセス時の挙動

推奨。`/authorize` でアクセス判定に失敗した場合、redirect_uriは正当なので `error=access_denied&error_description=<理由>` を付けてTenant Web Applicationへ戻し、Tenant側で理由に応じた403画面を表示する。理由は `user_disabled` `tenant_suspended` `not_contracted` `no_membership` `membership_inactive` の5種。契約がないサービスは「テナント suzuki は CMS を契約していません」のように表示する。認証自体は成功しているためSSO Sessionは維持する。所属テナントと契約サービスの一覧は auth.sandbox.com の `/` ポータルとして実装した。auth を直接開いた場合と Global Logout 後の入口を兼ねる。

### D11. Tenant Isolationの実装レベル

推奨。アプリ層でのtenant_id強制を必須とし、PostgreSQLであれば Row Level Security を二重防御として追加する。DBがPostgreSQL以外の場合はアプリ層のみになる。

### D12. Global Logoutの実装フェーズ

推奨は初期実装で `sid` の発行と保存までとしていたが、Tenant Logout 後にリロードで再ログインされる挙動の分かりにくさから、Back-Channel Logout を含む Global Logout を前倒しで実装した。

### D13. OIDC Clientの登録単位の見直し。サービス単位とテナント契約

問題点。1つのAuth Serverで CRM と CMS のように複数のサービスを扱うと、同じ顧客企業が複数のサービスを契約する。D2のテナントごとに1 Clientでは、テナント×サービスの組ごとにClientが増え、テナント追加のたびに全サービス分のClient登録とSecret配布が必要になる。テナントとサービスは直交する軸であり、同じ単位で扱えない。

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A. サービスごとに1 Client。テナントは顧客としてサービス横断で共有し、契約 tenant_services で利用可否を判定 | Auth Serverは複数サービスを同じ仕組みで扱える。テナント追加にClient登録が不要で、契約の登録だけで済む。audがサービスごとに分かれるためTokenがサービスを越えない。Secretはサービス数分のみ | redirect_uriからテナントを解決する必要がある。契約テーブルが増える |
| B. テナントごとに1 Client。従来のD2 | audがテナントと一致しTokenのテナント境界が明確 | テナント×サービス分のClientが必要。テナント追加のたびにサービス数分のClient登録とSecret配布が発生する。契約という概念を表す場所がない |

決定はA。理由は、1つのAuth Serverで複数サービスを扱う前提では、テナント追加時にClient登録を不要にできること、サービスごとのaudでTokenのサービス越境を拒否できることが運用と安全性の両面で優るため。Bは以前の採用案であり、本決定で置き換える。

具体化。

- `oidc_clients.client_id` はサービスID。サンドボックスでは `crm` と `cms`。client_secret はサービス単位で持ち、テナントには紐付かない
- `oidc_clients.audience` にそのサービスのAPI originを持ち、Access Tokenのaudにする
- 認可リクエストのテナントは client_id と redirect_uri の組から解決する。解決方法は当初テナント×サービスごとの redirect_uri 行だったが、D15 でサービスごとの `redirect_uri_template` に置き換えた
- `identity.tenant_services(tenant_id, oidc_client_id, status)` が契約。`/authorize` と refresh_token grant で user → tenant → 契約 → Membership の順に検証する
- ホストは `<tenant>.<service>.<domain>`。Tenant Web Applicationは Host からサービスとテナントを解決する
- Back-Channel Logout URIはサービス単位。logout_tokenのsidでそのサービスの全テナントのセッションを削除する

### D14. apps の分割単位とプロセス構成

問題点。当初の検証実装は Tenant Web Application と API Server がそれぞれ1プロセスで、`SERVICES` と `API_HOSTS` の設定で crm と cms の全ホストを受けていた。この構成では別サービスが同じ Auth Server を使う姿を実物で示せず、サービスごとにデプロイする実運用ともデプロイ単位が合わない。

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A. サービスごとに web と api を1組ずつ持つ。実装は packages/web-core と packages/api-core に共有し、apps 側は環境変数で自サービスを決める薄い起動口にする | 別サービスが同じ Auth Server に接続する構成を実物で示せる。デプロイ単位が実運用と一致する。共有パッケージを持つため実装の重複はない | プロセス数とポート数が増える。サービス追加時に apps を2つ足す |
| B. 1プロセスで複数サービスを設定で切り替える。従来の構成 | プロセス数が少ない | 別サービスが同じ Auth を使う姿を実物で示せない。デプロイ単位が実運用と合わない |

決定はA。理由は、サンドボックスの目的が他プロジェクトへ展開するための実物を示すことにあり、サービスの独立性をプロセス構成として見せる必要があるため。Bは以前の構成であり、本決定で置き換える。

具体化。

- `apps/auth-api` は OpenID Provider。旧 auth-server の改名で、ログイン画面、ポータル、ログアウト画面の HTML は当面ここで配信する
- `apps/crm-web` と `apps/cms-web` は Tenant Web Application。`packages/web-core` の Hono アプリを `CLIENT_ID` `CLIENT_SECRET` `SERVICE_NAME` `BASE_HOST` `API_BASE_URL` で起動する
- `apps/crm-api` と `apps/cms-api` は API Server。`packages/api-core` の Hono アプリを `API_BASE_URL` で起動する。aud は `API_BASE_URL` の1つだけで、Host が URL のホストと異なるリクエストは 404
- `tools/provision` は AWS 向けの一回限りタスクで、全サービスの `SERVICES` を引き続き受け取る
- `*-web` はクライアントを意味するが、Token と Cookie をブラウザへ出さない BFF 方式のため薄いサーバーは残す。判断事項D1
- 次の段階で `*-web` の画面を React Router v7 の SPA に置き換え、auth-api から画面を `auth-web` として分離する予定

### D15. Identity DB の主キーと redirect_uri、client_secret の持ち方

問題点。D13 の当初実装は `oidc_clients.client_id` を主キーとし、redirect_uri をテナント×サービスごとの行で登録し、client_secret を oidc_clients の 1 列に scrypt で保存していた。この形では、テナントを 1 つ足すたびに契約サービス数分の redirect_uri 行を登録する必要があり、client_id を変えると tenant_services と redirect_uri の外部キーが連鎖して更新される。client_secret が 1 列のため、ローテーションは旧 secret を上書きした瞬間に旧 secret を持つサービスが `/token` で invalid_client になり、無停止で切り替えられない。scrypt は `/token` のたびに数十ミリ秒イベントループを止め、Refresh が集中する時間帯に Auth Server 全体の応答を遅らせていた。

| 項目 | 選択肢 | メリット | デメリット |
| --- | --- | --- | --- |
| 主キー | A. サロゲート ID を主キーにし、client_id は UNIQUE の公開識別子にする | client_id を変更しても外部キーは連鎖しない。すべての表が同じ ULID の規約で揃う | 結合が 1 段増える。client_id での検索に UNIQUE インデックスが必要 |
| 主キー | B. 自然キー client_id を主キーに保つ | 表が 1 つ減り、結合が減る | client_id の変更が tenant_services と secret の外部キーへ連鎖する。他の表と主キーの規約が揃わない |
| redirect_uri | A. サービスごとに `{tenant}` を 1 か所含む `redirect_uri_template` を 1 つ持ち、展開結果との完全一致で検証する | テナント追加時の登録が tenants と tenant_services だけになる。テナント追加コストがサービス数に比例しない。テンプレートを slug で展開した文字列と完全一致させるため、ワイルドカード禁止と完全一致の要件は保たれる | テナントに紐付かない戻り先を表現できない。redirect_uri の形をサービス内で 1 種類に固定する |
| redirect_uri | B. テナント×サービスごとの redirect_uri 行を持つ | 行単位で任意の URI を登録できる。テナントなしの戻り先も NULL 行で表せる | テナント追加のたびにサービス数分の行を登録する。登録漏れが `/authorize` の 400 として顧客に見える。テンプレートで表せる情報を行に複製している |
| client_secret | A. oidc_client_secrets に複数行持ち、active な行のいずれかで認証する | 新 secret を追加 → サービスを切替 → 旧 secret を revoked の順で無停止ローテーションできる。revoked_at で履歴が残る | 表が 1 つ増える。active 行の検索に部分インデックスが必要 |
| client_secret | B. oidc_clients に secret のハッシュを 1 列持つ | 表が少ない | ローテーションが上書きになり、切替の瞬間に旧 secret のサービスが invalid_client になる。猶予期間を作れない |
| ハッシュ | A. SHA-256。`sha256$<base64url>` | ハッシュ計算がマイクロ秒で終わり `/token` のイベントループを止めない。client_secret は 32 バイト以上の乱数なので辞書攻撃への耐性を KDF で補う必要がない | secret が短い場合の防御にならない。登録時に乱数長を強制する必要がある |
| ハッシュ | B. scrypt | 短い secret でも辞書攻撃に耐える | `/token` のたびに数十ミリ秒イベントループを止める。client_secret は人が選ぶパスワードではないため、この耐性が要らない |

決定はすべて A。理由は次のとおり。

- テナント追加コストが O(サービス数) から O(1) になる。tenants と tenant_services を足すだけで、どのサービスにも redirect_uri の登録が要らない
- client_id の変更や外部キーの連鎖がなくなる。tenant_services と oidc_client_secrets は `oidc_clients.id` だけを参照する
- client_secret のローテーションが無停止で行える。新旧 2 行が active の間は `/token` がどちらも受け付ける
- `/token` のイベントループ阻害をなくす。SHA-256 と `timingSafeEqual` で照合し、乱数長は登録手順と provision で 32 バイト以上を強制する

具体化。

- `identity.oidc_clients(id, client_id UNIQUE, name, audience, redirect_uri_template, allowed_scopes, backchannel_logout_uri, status)`。`redirect_uri_template` は `{tenant}` を 1 か所だけ含む
- `identity.oidc_client_secrets(id, oidc_client_id, secret_hash, status, created_at, revoked_at)`。active 行の部分インデックスを持つ
- `identity.tenant_services(tenant_id, oidc_client_id, status)`。主キーは `(tenant_id, oidc_client_id)`
- `/authorize` は redirect_uri をテンプレートに当てて slug を取り出し、tenants を slug で引く。テンプレート不一致と未知の slug はどちらも `invalid_redirect_uri` でリダイレクトしない。テナントに紐付かない認可は存在せず、ID Token と Access Token に常に `tenant_id` と `tenant_slug` が載る
- Global Logout の戻り先とポータルのリンクは、テンプレートをテナント slug で展開して導く
- provision は `SERVICES[].baseHost` から `<PUBLIC_SCHEME>://{tenant}.<baseHost>/auth/callback` を書き、サービスごとに active な secret を 1 行 upsert し、それ以外の active な secret を revoked にする
- `*-api` の環境変数は `API_HOST` から `API_BASE_URL` に改名し、provision が `oidc_clients.audience` に書く `apiBaseUrl` と同じ値を与える。aud はその値そのもので、Host が URL のホストと異なるリクエストは 404
- `updated_at` はトリガー `identity.touch_updated_at()` で更新する

## 5. 移行計画

グリーンフィールドのため、構築順序として記述する。

| フェーズ | 内容 | 完了条件 |
| --- | --- | --- |
| 0 | 判断事項D1からD4の決定 | 本ドキュメントの承認 |
| 1 | Identity DBとClient Registryの構築。Cognito User Pool作成 | seedデータでusers / tenants / tenant_members / oidc_clients / tenant_servicesが投入できる |
| 2 | Auth Server。`/authorize` `/login` `/token` `/jwks` `/userinfo` | 初回ログインシーケンスが通る |
| 3 | Tenant Web Application。OIDC Client共通モジュール | 別テナントSSOと別サービスSSOのシーケンスが通る |
| 4 | API Server。Token検証とMembership認可、Tenant Isolation | 他テナントデータへのアクセスが拒否される |
| 5 | Tenant Logout。エラーケース対応 | エラーケース一覧のテストが通る |
| 6 | MFA、Global Logout、Refresh Tokenローテーション | 拡張シーケンスが通る |

既存システムがある適用先では、フェーズ2完了後に既存ログインを `/auth/login` へ差し替え、Cognito Tokenを直接使う箇所をAPI Server経由へ置き換える工程をフェーズ3と4の間に挟む。
