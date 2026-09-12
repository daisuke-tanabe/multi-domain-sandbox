# 現状分析と判断が必要な事項

## 結論

本リポジトリは新規サンドボックスであり、既存の認証実装・DB・インフラは存在しない。
したがって仕様書22章の調査対象はなく、24章の「現状分析 / 現在の認証フロー / 現在の問題点 / 移行計画」はグリーンフィールド前提で記述する。
推奨アーキテクチャは OIDC Authorization Code Flow + PKCE を用いた独立OpenID Provider方式とし、Tenant Web ApplicationはBFF構成とする。
OIDC Client はサービス単位で登録し、テナントは顧客としてサービス横断で共有する。テナントがサービスを使えるかは契約で判定する。判断事項D13。
検証実装はサービスごとに web と api のプロセスを持ち、実装は共有パッケージに置く。判断事項D14。
Identity DB の主キーはサロゲート ID、redirect_uri はサービスごとのテンプレート、client_secret は複数行でローテーション可能、ハッシュは SHA-256 とする。判断事項D15。
招待と役割はテナント単位ではなくサービス単位で持つ。契約は会社単位の tenant_services、割り当てはサービス単位の tenant_service_members に置く。判断事項D16。
DB はサービスごとに分け、identity は「入れるか」だけを持つ。役割と権限はサービスの DB の members と permission_overrides に置き、Token には載せない。招待はサービスの画面から auth-api の管理 API を経由して行い、identity にいない人はメールで事前作成して初回ログイン時に紐付ける。判断事項D17。
Tenant Web Application の画面は React Router v8 の SPA とし、薄い BFF が `/auth/*`、`/session`、`/api/*` の中継、SPA の配信だけを担う。SPA は Token を見ない。判断事項D18。
auth の画面も React Router v8 の SPA とし、apps/auth-web を auth-api が同一オリジンで配る。資格情報の送信は HTML フォーム POST を維持し、エラー画面はサーバー HTML のまま。判断事項D19。
フロントは shadcn/ui + Tailwind v4 + react-hook-form で、画面は feature 単位のコロケーション。型共有は packages/api-contract の zod スキーマ。バックエンドはクリーンアーキテクチャの 4 層。判断事項D20。
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
| テナントアクセス可否 | `/authorize` 時にAuth Serverが user → tenant → 契約 → サービスへの割り当て の順に検証 |
| API認証 | Auth Server発行のAccess Token。JWT RS256。aud=サービスごとのAPI origin。BFFがサーバー間で送信 |
| API認可 | Token検証 → sub / tenant_id / client_id取得 → 自サービス DB の members から Role → 役割の既定に permission_overrides を重ねて Permission → データアクセス。Tokenにroleもpermissionも載せず、API は Identity DB を参照しない |
| Tenant Isolation | Token内tenant_idとリソースのtenant_idの一致をアプリ層で強制。DB RLSで二重化 |
| Identity DB | users / tenants / tenant_services / tenant_service_members / tenant_members はAuth Serverが所有し、Auth Server だけが接続する。役割と権限、業務データは各サービスの DB に置く。判断事項D17 |
| 招待 | サービスの画面から。サービスの API が Auth Server の管理 API で割り当てを登録し、自 DB に役割付きの member 行を作る。判断事項D17 |
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
| D16 | 招待と役割はサービス単位。契約は会社単位の tenant_services、割り当ては tenant_service_members。tenant_members は会社横断の役割にだけ使う。Token に role も permission も載せない。2026-09-11 決定。役割の置き場所は D17 で見直し |
| D17 | DB はサービスごとに分け、PostgreSQL のコンテナも分ける。identity は「入れるか」だけを持ち、役割と権限はサービスの DB の members と permission_overrides に置く。招待はサービスの画面から auth-api の管理 API を経由し、identity にいない人はメールで事前作成して初回ログイン時に紐付ける。画面は当面プレースホルダにし、D18 で SPA にした。2026-09-11 決定 |
| D18 | `*-web` の画面は React Router v8 の SPA モード。`packages/web-core` の BFF は `/auth/*`、`/session`、`/api/*` の中継、SPA の配信だけを担い、Token をブラウザへ出さない。共通の React コードは `packages/web-ui`。2026-09-11 決定。auth の画面は D19 で SPA にした |
| D19 | auth の画面も React Router v8 の SPA。apps/auth-web を auth-api が同一オリジンで配る。資格情報の送信は HTML フォーム POST を維持。エラー画面はサーバー HTML のまま。2026-09-12 決定 |
| D20 | フロントは shadcn/ui + Tailwind v4 + react-hook-form、feature 単位のコロケーション。型共有は packages/api-contract の zod スキーマ。バックエンドはクリーンアーキテクチャの 4 層。2026-09-12 決定 |

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

問題点。users / tenants と所属関係の表は、Auth Serverがアクセス可否判定に使い、API Serverが認可に使う。両者から参照されるデータの所有者を決めないと境界が崩れる。

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

推奨。初期は `owner` `admin` `member` `viewer` の固定enum。細粒度権限はAPI Server側のRole→Permissionマッピングで表現する。D16 でサービスごとの役割に改め、D17 で役割そのものをサービスの DB に移した。役割の語彙はサービスごとに `ServiceDefinition` で宣言し、CRM は owner / admin / member / viewer、CMS は owner / editor / viewer。個別の許可 / 拒否はサービス側 DB の permission_overrides で役割の既定に重ねる。Identity DB は役割を持たない。

### D9. ユーザーとMembershipの自動作成

推奨。usersはCognito認証成功時にJIT作成する。tenant_service_membersとtenant_membersは自動作成しない。招待の単位はサービスで、D16 に従う。当初は招待フローをスコープ外としてシード投入で代替したが、D17 でサービスの画面から auth-api の管理 API を経由する招待を実装した。招待された人は users にメールで事前作成され、初回ログイン時に cognito_sub が紐付く。サービスの DB の member 行は招待時に作られ、auth を通れるのに member 行がない人は最初の API 呼び出しで最下位の役割で作られる。

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
- `identity.tenant_services(tenant_id, oidc_client_id, status)` が契約。`/authorize` と refresh_token grant で user → tenant → 契約 → サービスへの割り当て の順に検証する。割り当ての表は D16 で tenant_service_members に定めた
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

- `apps/auth-api` は OpenID Provider。旧 auth-server の改名。ログイン画面、ポータル、ログアウト画面は当初ここがサーバー側の HTML で描いていたが、D19 で `apps/auth-web` の SPA に置き換え、auth-api は SPA の配信と SPA 向けの `/api/*` を持つ
- `apps/crm-web` と `apps/cms-web` は Tenant Web Application。`packages/web-core` の Hono アプリを `CLIENT_ID` `CLIENT_SECRET` `SERVICE_NAME` `BASE_HOST` `API_BASE_URL` で起動する
- `apps/crm-api` と `apps/cms-api` は API Server。`packages/api-core` の Hono アプリを `API_BASE_URL` で起動する。aud は `API_BASE_URL` の1つだけで、Host が URL のホストと異なるリクエストは 404
- `tools/provision` は AWS 向けの一回限りタスクで、全サービスの `SERVICES` を引き続き受け取る
- `*-web` はクライアントを意味するが、Token と Cookie をブラウザへ出さない BFF 方式のため薄いサーバーは残す。判断事項D1
- `*-web` の画面は D18 で React Router v8 の SPA に置き換えた。auth の画面は D19 で `apps/auth-web` に分離した。auth-web はサーバーを持たず、auth-api が配る

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

### D16. 招待と役割の単位。テナントではなくサービス

問題点。D13 までの所属は tenant_members の 1 行で表し、テナントに所属していれば契約済みのすべてのサービスに同じ役割で入れた。B2B では契約は会社単位だが、人の割り当てはサービス単位で行いたい。「CRM だけ使える人」や「CRM では admin だが CMS では viewer」を表せず、サービス単位で利用者を外すこともできない。監査で「誰がどのサービスをいつから使えたか」を会社ごとに答えられない。細かい権限を Token に載せると、権限を変えても Token 寿命の間は反映されず、Auth Server がサービスごとの権限語彙を知る必要が生じる。

| 項目 | 選択肢 | メリット | デメリット |
| --- | --- | --- | --- |
| 招待と役割 | A. 契約は会社単位の tenant_services に置き、割り当てと役割はサービス単位の tenant_service_members に置く | 購買、請求、席数、解約が会社単位で完結する。会社の管理者がサービスごとに人を割り当て、サービスごとに外せる。監査が会社ごとに「誰がどのサービスをいつから」を答えられる。Google Workspace、Microsoft 365、Atlassian と同じ形で、組織がライセンスを持ち、人への割り当てはサービスごと | 表が 1 つ増える。招待をサービスごとに行う |
| 招待と役割 | B. ユーザーごとにサービスのライセンスを持つ | 個人単位で細かく制御できる | 会社単位の解約やオフボーディングが難しい。請求の単位が不明確になる |
| 招待と役割 | C. テナント単位の所属だけ。従来の tenant_members | 表が少ない | 「CRM だけ」やサービスごとの役割を表せない。サービス単位で外せない |
| 細かい権限 | A. Token に載せず、各サービスが自分の DB に持ちリクエストごとに読む | 変更が即時に反映される。Auth Server がサービスの権限語彙を知らなくてよい。Token がサービスごとの語彙で肥大化しない | API がリクエストごとに 1 クエリ増える |
| 細かい権限 | B. Token に permissions claim を載せる | API が DB を引かずに判定できる | 変更が Token 寿命まで反映されない。Auth Server が全サービスの権限語彙を持つ。Token が大きくなる |

決定はどちらも A。理由は、B2B の契約単位と割り当て単位を分けることで請求と解約を会社単位に保ちながら、サービスごとの利用者管理と監査を成立させられるため。細かい権限を Token に載せない理由は、権限変更を即時に反映し、認証基盤をサービスの語彙から独立させるため。

具体化。

- `identity.tenant_service_members(tenant_id, oidc_client_id, user_id, role, status, created_at, updated_at)`。主キーは `(tenant_id, oidc_client_id, user_id)`。`(tenant_id, oidc_client_id)` は tenant_services への複合外部キーで、契約のないサービスに人を割り当てられない。user_id にインデックス、updated_at はトリガー
- `identity.tenant_members(tenant_id, user_id, role, status)` は残すが、管理者や請求担当のような会社横断の役割にだけ使う。ログイン可否には使わない
- `/authorize` と refresh_token grant は user active → tenant active → 契約 active → このサービスへの割り当て active の順に判定する。理由コードは `user_disabled` `tenant_suspended` `not_contracted` `no_membership` `membership_inactive` のまま。`no_membership` は「このテナントのこのサービスに割り当てがない」を意味し、別サービスの割り当てでは通らない
- ポータルはテナントごとに、割り当てがあり契約と Client が active なサービスだけを並べ、役割を `<client_id> / <role>` で示す。割り当てがなければ「利用できるサービスがありません。管理者に招待を依頼してください。」を表示する。テナント単位の役割はポータルに出さない
- Token は変わらない。ID Token と Access Token は sub、tenant_id、tenant_slug、sid、client_id を持ち、role も permission も載せない
- api-core は `IdentityReader.findAccessContext(userId, tenantId, clientId)` で users、tenants、oidc_clients、tenant_service_members を 1 回の JOIN で引く。割り当ては Token の client_id に一致するものだけを見る
- `business.member_permissions(tenant_id, user_id, client_id, permission, effect)`。effect は allow / deny。projects と同じ RLS ポリシーを持ち、`PermissionReader.listOverrides` が app.tenant_id を設定したトランザクションで読む。`resolvePermissions(role, overrides)` は役割の既定 ∪ allow − deny で、deny が優先し、未知の permission 名は無視する。`TenantContext` は clientId、role、permissions を持ち、`requirePermission` は permissions の集合で判定する。`/v1/me` は permissions をソート済み配列で返す
- サンドボックスでは 1 つの DB を crm-api と cms-api が共有するため member_permissions に client_id 列を持つ。実運用では各サービスの DB がこの表を持ち、client_id 列は不要になる
- 会社のオンボーディング。CRM だけ契約する会社は tenants 1 行、tenant_services 1 行、利用者数分の tenant_service_members。後から CMS を足すときは tenant_services 1 行と CMS を使う人の割り当て。サービスごとのテナントも、会社ごとの Client 登録も要らない
- provision は `SEED_SERVICE_MEMBERSHIPS` で tenant_service_members、`SEED_PERMISSION_OVERRIDES` で member_permissions を投入する
- シード。tenant_service_members は alice が tanaka × crm の owner、tanaka × cms の owner、suzuki × crm の viewer、bob が suzuki × crm の admin、carol は割り当てなし。member_permissions は alice が tanaka × cms で `projects:write` を deny。alice は tanaka.cms の owner だが Project を作れず、smoke と web のテストが「この操作を行う権限がありません」を確認する。tenant_members は alice が tanaka の owner、bob が suzuki の owner

上記の具体化のうち、tenant_service_members の role 列、business スキーマと member_permissions の client_id 列、`IdentityReader` による API からの Identity DB 参照、provision の `SEED_PERMISSION_OVERRIDES`、projects のシードは D17 で置き換えた。現在の形は D17 を正とする。

### D17. DB の分割と役割の置き場所、招待の経路

問題点。D16 は役割を identity の tenant_service_members に持ち、API がリクエストごとに Identity DB を参照して割り当てと役割を再検証する形だった。この形では Auth Server の DB にサービスの語彙である役割が入り、CMS の editor のようにサービスごとに違う語彙を identity の CHECK 制約で表せない。API が Identity DB に接続するため、サービスを別リポジトリや別インフラに分けたときに Identity DB の接続情報とスキーマをサービスへ配る必要が生じ、DB のスキーマ変更が全サービスに波及する。サンドボックスは 1 つの DB を crm と cms で共有していたため business スキーマに client_id 列が要り、実運用の形と乖離していた。招待の経路もなく、シードでしか人を足せなかった。

| 項目 | 選択肢 | メリット | デメリット |
| --- | --- | --- | --- |
| DB の構成 | A. サービスごとに DB と PostgreSQL コンテナを分ける。identity は auth-api だけが接続し、crm-api は crm DB、cms-api は cms DB だけに接続する。共有するのは user_id と tenant_id の値だけ | サービスが自分の DB だけで完結し、別リポジトリや別インフラに分けられる。Identity DB のスキーマ変更がサービスに波及しない。実運用の形と同じ | ローカルのコンテナが 3 つになる。DB 間の整合はアプリが保つ。AWS の RDS 構成の見直しが要る |
| DB の構成 | B. 1 つの DB を identity / business スキーマで分ける。従来 | コンテナが 1 つで済む | API が Identity DB に接続する。サービス側の表に client_id 列が要る。サービスを分けたときに形が変わる |
| 役割の置き場所 | A. サービスの DB の members に置く。identity は「入れるか」だけを持つ | 役割の語彙をサービスごとに自由に決められる。Auth Server がサービスの語彙を知らない。役割の変更がサービスの中で閉じる | 「入れるか」と役割が別の DB にあり、招待時に 2 か所へ書く |
| 役割の置き場所 | B. identity の tenant_service_members に role 列を持つ。従来 | 割り当てと役割が 1 行で済む | identity の CHECK 制約が全サービスの語彙を持つ。API が Identity DB を参照する |
| 役割の置き場所 | C. Token に role や permissions を載せる | API が DB を引かずに判定できる | 変更が Token 寿命まで反映されない。Auth Server が全サービスの語彙を持つ。D16 で却下済み |
| 権限の判定 | A. API が自分の DB の members と permission_overrides をリクエストごとに読む | 変更が即時に反映される。Identity DB への接続が不要 | リクエストごとに自 DB を 2 回読む |
| 権限の判定 | B. API がリクエストごとに auth-api に問い合わせる | DB を分けても identity の状態を即時に見られる | API の可用性が auth-api に依存する。リクエストごとに HTTP が増える。auth が Token 発行時と Refresh 時に判定済みの「入れるか」を二重に確認するだけで得るものが少ない |
| 招待の経路 | A. サービスの画面から。サービスの API が auth-api の管理 API を client_secret_basic で呼んで「入れる」を登録し、返った user_id で自分の DB に役割付きの member 行を作る | 管理者はサービスの中で招待から役割の設定まで完結できる。auth-api は Client 自身のサービスへの割り当てだけを操作させればよく、権限の語彙を知らない | サービスの API が auth-api の Back Channel を 1 つ増やす。auth-api に Client 認証付きの管理 API が要る |
| 招待の経路 | B. auth のポータルからだけ招待する | 招待の入口が 1 か所 | ポータルがサービスごとの役割を知る必要がある。役割はサービスの DB にあるため、ポータルから設定できない |
| 未登録ユーザーの招待 | A. users にメールで事前作成し cognito_sub を NULL にしておき、初回ログイン時に同じメールの行へ sub を紐付ける | Cognito に存在する前でも招待できる。招待した人の user_id が招待時に確定し、サービスの DB に member 行を先に作れる | users.email に UNIQUE が要る。同じメールが別の Cognito ユーザーに紐付く事故を防ぐ判定が要る |
| 未登録ユーザーの招待 | B. 初回ログインで JIT 作成されるまで待つ | users の列を変えない | 招待時に user_id が決まらず、サービスの DB に役割を置けない |
| 画面 | A. 当面は `/dashboard` で role と権限の表を出すプレースホルダにし、次の段階で React Router v7 の SPA にする | API を先に揃え、画面の作り直しを 1 回にできる | 招待や権限編集の画面が一時的にない |
| 画面 | B. Hono の HTML で招待や権限編集の画面まで作る | すぐに画面で確認できる | SPA 化で捨てる画面を作る |

決定はすべて A。理由は次のとおり。

- サービスが自分の DB と自分の役割語彙だけで完結し、Auth Server は「誰がどのテナントのどのサービスに入れるか」だけを持つ。認証基盤とサービスの境界が DB の境界と一致する
- 権限の変更は次のリクエストから反映され、API は auth-api の可用性に依存しない。「入れるか」は Token 発行時と Refresh 時に判定済みで、割り当てを外された人は最大 15 分で Refresh に失敗する
- 招待をサービスの中で完結させ、auth-api は Client 認証で自サービスの割り当てだけを操作させる。メールでの事前作成により、招待時に user_id が確定する
- 画面は SPA で作り直すため、Hono の HTML はプレースホルダに留める。D18 で置き換えた

具体化。

- docker compose は `db-identity` 5432、`db-crm` 5433、`db-cms` 5434 の 3 コンテナ。初期化 SQL は `db/identity/init` `db/crm/init` `db/cms/init`。ロールは `sandbox_auth` `crm_app` `cms_app`。business スキーマ、`sandbox_api` ロール、projects 表は廃止
- `identity.users.cognito_sub` は NULL 可の UNIQUE、`email` は NOT NULL UNIQUE。`identity.tenant_service_members(tenant_id, oidc_client_id, user_id, status)` から role 列を外す
- ログイン時の users の解決は cognito_sub → 同じメールで cognito_sub が NULL の行に紐付け → JIT 作成の順。同じメールが別の sub に紐付いていればログインを拒否する
- auth-api に `/admin/service-members` を追加。GET は一覧、POST は `{tenant_id, email, name?}` で事前作成と割り当ての upsert、DELETE は `{tenant_id, user_id}` で割り当ての削除。client_secret_basic で認証し、呼び出した Client のサービスに限る。テナントがそのサービスを契約していなければ 403 `not_contracted`。`/token` と同じレート制限
- `packages/api-core` はサービス API のフレームワークになる。`ServiceDefinition` で役割の順序、既定の役割、権限、役割ごとの既定を宣言し、`members:read` `members:invite` `members:manage` は自動で足す。`MemberRepository` が `<schema>.members` と `<schema>.permission_overrides` を扱い、`resolveTenantContext` は Host 確認 → Token 検証 → member 行の取得か既定の役割での JIT 作成 → 上書きの適用の順で `TenantContext` を作る。`/v1/me` と `/v1/members` はどのサービスにも付く。`AuthAdminClient` が auth-api の管理 API を呼ぶ
- `apps/crm-api` は owner / admin / member / viewer と `end_users:*` を宣言し、`/v1/end-users` の CRUD を持つ。`end_users:unmask` がなければメールと電話をマスクする。`apps/cms-api` は owner / editor / viewer と `posts:*` を宣言し、`/v1/posts` の CRUD を持つ
- `*-api` の環境変数は `PORT` `API_BASE_URL` `ISSUER` `AUTH_BACKCHANNEL_URL` `DATABASE_URL` `CLIENT_ID` `CLIENT_SECRET`。`DATABASE_URL` は自サービスの DB、`CLIENT_ID` と `CLIENT_SECRET` は管理 API の Client 認証で `*-web` と同じ値
- `packages/web-core` の `/dashboard` プレースホルダは D18 で SPA に置き換えた。E2E の harness は実物の crm-api / cms-api を接続する
- provision は identity DB に加えて `SERVICES[].databaseUrl` で各サービスの DB に接続し、`<clientId>_app` ロールと `db/<clientId>/init` の `002_schema.sql` `003_seed.sql` を冪等に適用する。`SEED_SERVICE_MEMBERSHIPS` は役割を持たず、サービス側の役割は `003_seed.sql` の値が入る。Terraform は identity / crm / cms の RDS 3 台に更新済みで、apply は未実施
- シード。identity では alice が tanaka × crm、tanaka × cms、suzuki × crm に入れ、bob が suzuki × crm に入れる。crm の members は alice が tanaka で owner、suzuki で viewer、bob が suzuki で admin。suzuki の alice に `end_users:unmask` の allow。cms の members は alice が tanaka で owner で、`posts:create` の deny。crm の end_users は tanaka に 3 件、suzuki に 2 件。cms の posts は tanaka に 2 件。dave はモック Cognito にだけ存在し、招待と初回ログインの紐付けの確認に使う

### D18. 画面の実行形態。React Router v8 の SPA と薄い BFF

問題点。D17 までの `*-web` は Hono がサーバー側で HTML を描き、`/dashboard` で role と権限の表を出すプレースホルダだった。エンドユーザー、投稿、招待、権限編集の画面を足すには、サーバー側の HTML で作るか SPA にするかを決める必要がある。D1 で BFF 構成を決めているため、SPA にしても Token をブラウザへ出さない制約は保つ必要があり、ブラウザから API を呼ぶ経路と CSRF の扱いを決めなければならない。

| 項目 | 選択肢 | メリット | デメリット |
| --- | --- | --- | --- |
| 画面の描画 | A. React Router の SPA モード。`ssr: false` で `clientLoader` だけを使い、BFF は静的ファイルを配る | 画面の状態管理とルーティングをブラウザで完結できる。BFF に React の実行環境が要らず、`packages/web-core` が Hono のまま薄く保てる。他プロジェクトの SPA にそのまま持ち込める | 初回表示は `/session` と `/v1/me` を読んでからになる。SSR がないため HydrateFallback を出す |
| 画面の描画 | B. React Router の SSR。BFF が React をサーバーで実行する | 初回表示が速い。loader をサーバーで動かせる | BFF が React のサーバー実行を持ち、Hono の BFF と 2 つのサーバーになる。Token をサーバーの loader で扱う経路が増え、境界が曖昧になる |
| 画面の描画 | C. Hono の HTML を続ける | 変更が少ない | フォームと部分更新の実装が膨らむ。他プロジェクトの React 構成に持ち込めない |
| API の呼び出し | A. BFF の `/api/*` が同一オリジンで中継し、サーバー側の Access Token を付ける | ブラウザに Token が出ない。CORS が要らない。API の `API_BASE_URL` をブラウザに渡さない | BFF を 1 ホップ経由する |
| API の呼び出し | B. ブラウザが API のホストへ直接呼ぶ | BFF の中継が要らない | Token をブラウザに渡すか、API に独自の Cookie が要る。D1 で却下した形 |
| CSRF | A. `/session` で渡す CSRF トークンを書き込みの `X-CSRF-Token` ヘッダで要求し、body は JSON に限る | Cookie が Lax でも書き込みを守れる。フォーム送信では付かないヘッダなので、他オリジンからの書き込みを止められる | SPA が `/session` を先に読む必要がある |
| CSRF | B. SameSite=Lax だけに頼る | 実装が要らない | 同一サイトの別ホストからの書き込みを止められない |
| CSP | A. 静的配信では `script-src 'self'` と `index.html` のインラインスクリプトのハッシュに限定し、Vite への中継は開発専用で `'unsafe-inline'` を許す | 本番で `'unsafe-inline'` を使わない。開発の HMR も動く | 中継モードを本番で使えないよう `PUBLIC_SCHEME=https` で `SPA_DIR` を必須にする |
| CSP | B. 常に `'unsafe-inline'` を許す | 設定が 1 つで済む | XSS の防御が弱くなる |

決定はすべて A。理由は次のとおり。

- D1 の BFF 構成を保ったまま、画面を SPA にできる。Token はサーバー側セッションに留まり、ブラウザは Cookie 付きの同一オリジン fetch だけを行う
- `packages/web-core` が Hono の薄い BFF のまま残り、他プロジェクトへ持ち込むときに React の実行環境を要求しない
- 画面の出し分けは `/v1/me` の確定した権限で行い、最終判定は API がするため、権限のロジックが 1 か所に留まる
- 静的配信の CSP で `'unsafe-inline'` を使わず、開発の利便性は中継モードに閉じ込める

具体化。

- `packages/web-core` は `/auth/*`、`GET /session`、`ALL /api/*`、SPA の配信を持つ。`/session` は `service` `tenant` `urls` `authenticated` と、ログイン済みなら `user` `csrfToken` を返し、Token は返さない。`/api/*` はセッションがなければ 401、GET / HEAD / OPTIONS 以外は `X-CSRF-Token` の一致を要求して不一致は 403、body は JSON のみで 415、上限 64 KB。API のセッション切れは 401 にして SPA を再ログインさせる
- SPA の配り方は `SPA_DIR` と `SPA_DEV_SERVER_URL` で決める。`SPA_DIR` は `react-router build` の `build/client` で、`/assets/*` を immutable で配り、それ以外の GET は `index.html` を返す。`SPA_DEV_SERVER_URL` は `react-router dev` の Vite への中継で開発専用。両方なければ最小の HTML を返し警告を出す。テストはこのモード
- CSP は静的配信で `script-src 'self'` と `index.html` のインラインスクリプトの sha256、中継で `'unsafe-inline'` と Vite の origin と ws origin への `connect-src`。`PUBLIC_SCHEME=https` では `SPA_DIR` を必須にする
- `/healthz` と Back-Channel Logout はテナント解決の前に受ける。不明なホストや未契約のような SPA へ渡す前のエラーは `packages/web-core/src/views` のサーバー側 HTML で返す
- `packages/web-ui` を新設し、`api.ts` に `loadSession` `api` `loadMe` `ApiError` `describeError`、`shell.tsx` に `loadShell` `useShell` `usePermissions` `AppShell`、`members-page.tsx` に CRM と CMS 共通の管理アカウント画面、`styles.css` を置く。`loadShell` はルートの `clientLoader` で、未ログインなら `/auth/login?return_to=<現在のパス>` へ送り、`?logged_out=1` のときだけログアウト済み画面を出す
- `apps/crm-web` と `apps/cms-web` は `src/main.ts` で BFF を起動し、`app/root.tsx` `app/routes.ts` `app/routes/*.tsx` に画面、`react-router.config.ts` `vite.config.ts` `tsconfig.app.json` を持つ。CRM はホーム、エンドユーザー、管理アカウント、CMS はホーム、投稿、管理アカウント。`dev` は BFF と `react-router dev` を並行起動、`build` は `react-router build`、`start` は BFF のみ
- Tenant Logout は `/?logged_out=1` へ戻す。SPA のログアウト済み画面はログインへのリンクを持ち、全体からのログアウトはログイン中のヘッダに置く
- `scripts/smoke.ts` は `/session` と `/api/v1/me` の JSON を叩き、`scripts/chrome-check.ts` は実 Chrome で SPA を描画して確認する

D18 の時点では auth-api のログイン、ポータル、Global Logout の画面はサーバー側の HTML のままだった。D19 で `apps/auth-web` の SPA に置き換えた。

### D19. auth の画面。apps/auth-web の SPA と auth-api による配信

問題点。D18 で `*-web` を SPA にした後も、auth-api のログイン、ポータル、Global Logout の画面は `views/pages.ts` のサーバー側 HTML だった。画面の見た目と部品が `*-web` と揃わず、React の共通コードを auth に持ち込めない。一方で auth は資格情報を扱うため、SPA にしても `/login` のフォーム POST から `/authorize` の続きへ 303 で戻るリダイレクト連鎖と、`/login` のレート制限を変えたくない。SPA をどこから配るか、パスワードをどう送るか、SPA が読み込まれる前に起きるエラーをどう出すかを決める必要がある。

| 項目 | 選択肢 | メリット | デメリット |
| --- | --- | --- | --- |
| 配信 | A. `apps/auth-web` を新設し、auth-api が同一オリジンで配る。web-core と同じ `mountSpa` を `packages/shared` に置いて共有する | Cookie と CSRF の扱いが同一オリジンで閉じる。CORS が要らない。配信と CSP の実装が `*-web` と同じになる | auth-api が静的配信と Vite への中継を持つ |
| 配信 | B. auth-web を別ホストで配る | auth-api がサーバーだけになる | ログインフォームの POST と CSRF Cookie がオリジンをまたぐ。CORS と Cookie の SameSite の扱いが増える |
| 資格情報の送信 | A. HTML フォームの POST を維持し、SPA は `/api/login` で `rid` と CSRF を受け取ってフォームを描くだけにする | パスワードを JS で扱わない。`/login` のリダイレクト連鎖とレート制限が変わらない。失敗は `/login?error=<kind>` へ戻し、文言は `/api/login` が返す | 失敗時にページ遷移が 1 回入る |
| 資格情報の送信 | B. fetch で JSON を送り、SPA が結果を受けて遷移する | 画面遷移なしでエラーを出せる | パスワードが JS を通る。`/authorize` の続きへの 302 を SPA が再現する必要がある |
| エラー画面 | A. `/authorize` の不正な redirect_uri、CSRF 不一致、入力不正、rid 期限切れの POST、404、500 は auth-api の最小 HTML で返す | SPA が信頼できない状態で起きるエラーを SPA へ運ばない。理由をクエリに載せない | `views/pages.ts` に `errorPage` が残る |
| エラー画面 | B. すべて SPA へリダイレクトして描く | サーバー側 HTML をなくせる | エラーの理由をクエリで運ぶ。不正なリクエストの応答が 302 になる |

決定はすべて A。理由は次のとおり。

- 同一オリジンで配ることで、CSRF Cookie とフォーム POST の設計を変えずに済む
- 資格情報を fetch で送らないことで、パスワードが JS を通らず、`/login` のリダイレクト連鎖とレート制限が D18 までと同じままになる
- SPA に渡す前のエラーをサーバー HTML に留めることで、`*-web` の `packages/web-core/src/views` と同じ境界になる

具体化。

- `apps/auth-web` は `app/root.tsx` `app/routes.ts` `app/routes/login.tsx` `app/routes/portal.tsx` `app/routes/logout.tsx` `app/api.ts` を持つ。`react-router.config.ts` は `ssr: false`、`vite.config.ts` は 127.0.0.1:5175。`packages/web-ui` からは `styles.css` と `Notice` だけを使い、BFF 向けの `api.ts` と `loadShell` は使わない
- auth-api は `packages/shared/src/spa.ts` の `mountSpa` で SPA を配る。`SPA_DIR` は `../auth-web/build/client`、`SPA_DEV_SERVER_URL` は `http://127.0.0.1:5175`。https の `ISSUER` では `SPA_DIR` を必須にする。CSP の `script-src` は静的配信でハッシュ、中継で `'unsafe-inline'`
- SPA 向けの JSON は `GET /api/login?rid=&error=`、`GET /api/portal`、`GET /api/logout?client_id=&tenant=`。すべて GET で `Cache-Control: no-store`。`/api/login` と `/api/logout` は `/login` `/logout` と同じレート制限
- `POST /login` は成功で `/authorize` の続きへ 303、rid なしは `/` へ。失敗は `/login?error=<kind>&rid=<rid>` へ 303。kind は `invalid_credentials` `user_disabled` `user_not_confirmed` `password_reset_required` `challenge_required` `unavailable`。ユーザー名は URL に載せない。文言は `/api/login` が返し、`invalid_credentials` と `user_disabled` は同一文言
- `POST /logout` は Global Logout を実行して Cookie を消し、`/logout?client_id=&tenant=` へ 303。SPA が `/api/logout` の `authenticated: false` と `returnTo` で完了画面を描く
- `views/pages.ts` には `errorPage` だけが残る

### D20. フロントの UI 基盤とディレクトリ構成、型共有

問題点。D18 と D19 の SPA は手書きの CSS クラスと素の `<form>` で画面を組み、`apps/*-web/app/routes/*.tsx` に画面を並べていた。画面が増えると部品の見た目が揃わず、フォームの検証が画面ごとに別実装になる。サーバーは契約の zod スキーマで入力を検証するのに、SPA は送るまで誤りを知れない。1 つの画面に関わるルート、API 呼び出し、フォーム、一覧が `routes/` と `packages/web-ui` に散らばり、feature を足すときに触る場所が定まらない。

| 項目 | 選択肢 | メリット | デメリット |
| --- | --- | --- | --- |
| UI 部品 | A. shadcn/ui。new-york、radix-ui、CSS 変数、neutral テーマ、ダークモードなし。実体は `packages/web-ui/src/components/ui` に置き 3 つの `*-web` で共有する | 部品のコードをリポジトリに持ち、依存の更新に振り回されない。`pnpm dlx shadcn add` で足せる。auth-web も同じ部品を使える | 生成物の `@/` import を相対パスに直す手間がある |
| UI 部品 | B. 手書きの CSS クラスを続ける | 依存が増えない | 画面ごとに見た目が揺れる。フォームやテーブルの部品を自前で育てることになる |
| スタイル | A. Tailwind CSS v4。設定は `styles.css` の `@theme` と CSS 変数だけで、tailwind.config は作らない。各 `*-web` の Vite に `@tailwindcss/vite` を足し、`root.tsx` で `styles.css` を副作用 import する | shadcn/ui の前提と一致する。クラス検出は `@source` で `packages/web-ui` まで届く | クラス名が JSX に並ぶ |
| スタイル | B. CSS Modules | クラス名が短い | shadcn/ui と組み合わせられない |
| フォーム | A. react-hook-form と `@hookform/resolvers/zod`。resolver には `packages/api-contract` の入力スキーマをそのまま渡す。エラーは項目の直下、サーバーエラーは `Alert`。文言は `z.locales.ja()` で日本語にする | サーバーと同じスキーマで送る前に検証できる。独自の検証を書かない。契約を変えると画面の検証も追従する | auth-web のログインとログアウトは資格情報を fetch で送らない D19 の決定により、素の HTML フォーム POST のまま残す |
| フォーム | B. 素の `<form>` と `FormData` | 依存が増えない | 検証がサーバー往復になる。項目ごとのエラー表示を自前で組む |
| ディレクトリ | A. feature 単位のコロケーション。`apps/*-web/app/features/<name>/` に `<name>.route.tsx` `<name>.api.ts` フォームと一覧を置き、`routes.ts` がそれを指す。`packages/web-ui` も `lib/` `components/` `features/` に分ける | 1 つの画面に関わるものが 1 か所に集まる。feature を足すときに触る場所が定まる。api 側の feature 先行の切り方と揃う | ルートモジュールの型は `./+types/<name>.route` から読む |
| ディレクトリ | B. `routes/` `components/` `api/` のように種類で切る | 種類ごとに探しやすい | 1 つの画面の変更が複数ディレクトリにまたがる |
| 型共有 | A. `packages/api-contract` の zod スキーマだけで共有する。サーバーは zValidator と `satisfies`、SPA は受信時の parse と resolver で同じスキーマを使う | 型と検証が 1 か所。契約パッケージは zod 以外に依存しない | 役割名のようにサービス定義で決まる制約は契約では `z.string()` にし、サーバー側で `refine` を重ねる |
| 型共有 | B. tRPC や OpenAPI 生成 | 呼び出しの型が自動で付く | Hono と React Router の両方に生成物や実行時の依存が増える。BFF の `/api/*` 中継と相性が悪い |
| バックエンド | A. クリーンアーキテクチャの 4 層を維持する。domain / application / infrastructure / interface | D17 以降の構成を変えない。`scripts/check-layers.ts` が逆向きの import を検出する | なし |

決定はすべて A。理由は次のとおり。

- 部品の実体をリポジトリに持つことで、3 つの `*-web` の見た目を 1 か所で揃えられる
- 契約の入力スキーマを resolver に渡すことで、サーバーと SPA の検証が 1 つになり、契約の変更が画面に追従する
- feature 単位に置くことで、api 側の feature 先行の切り方と web 側が揃い、サービスを足すときに触る場所が定まる
- 型共有を zod スキーマに限ることで、契約パッケージの依存を増やさず、BFF の中継をそのまま使える

具体化。

- `packages/web-ui/src` は `lib/api.ts` `lib/shell.ts` `lib/use-action.ts` `lib/zod-locale.ts`、`components/app-shell.tsx` `components/page-header.tsx` `components/notice.tsx` `components/ui/*`、`features/home/` `features/members/`、`styles.css`、`index.ts` を持つ。`components.json` は `packages/web-ui` に置き、生成物の `@/` import は相対パスに直す。クラス名の結合は `cn` パッケージで、`@sandbox/web-ui` から再 export する
- `apps/crm-web/app` は `root.tsx` `routes.ts` と `features/home/` `features/end-users/` `features/members/`、`apps/cms-web/app` は `features/posts/`、`apps/auth-web/app` は `features/portal/` `features/login/` `features/logout/` と `lib/api.ts` を持つ。ルートモジュールは `*.route.tsx` に統一する
- `lib/api.ts` は `loadSession` `api(schema, path, init)` `apiVoid` `loadMe` `describeError` `redirectToLogin`。`lib/shell.ts` は `loadShell` `useShell` `useShellData` `usePermissions`。`lib/use-action.ts` の `useAction` は書き込みを実行して loader を再検証し、エラーと送信中の状態を持つ
- 各 `*-web` の `root.tsx` は `styles.css` を副作用 import し、サービスの app は `configureZodLocale()` を先頭で呼ぶ。`vite.config.ts` は `@tailwindcss/vite` を足す
- 手書きの CSS クラスと `packages/web-ui/src/{api.ts,shell.tsx,members-page.tsx}`、`apps/*/app/routes/*.tsx`、`apps/auth-web/app/api.ts` は削除した
- 画面の文言のうちテストと `scripts/chrome-check.ts` が参照するものは `CONTENT.md` の「変えてはいけない文言」に列挙し、変えるときはスクリプトも同じコミットで直す。見た目の規約は `DESIGN.md`
- `scripts/chrome-check.ts` は空のエンドユーザーフォームを送って項目ごとに `[data-slot=field-error]` が出ること、入力して一覧に加わることを確認する項目を加え 14 項目になった。vitest は 136 件のまま

## 5. 移行計画

グリーンフィールドのため、構築順序として記述する。

| フェーズ | 内容 | 完了条件 |
| --- | --- | --- |
| 0 | 判断事項D1からD4の決定 | 本ドキュメントの承認 |
| 1 | Identity DBとClient Registryの構築。Cognito User Pool作成 | seedデータでusers / tenants / tenant_members / oidc_clients / tenant_services / tenant_service_membersが投入できる |
| 2 | Auth Server。`/authorize` `/login` `/token` `/jwks` `/userinfo` | 初回ログインシーケンスが通る |
| 3 | Tenant Web Application。OIDC Client共通モジュール | 別テナントSSOと別サービスSSOのシーケンスが通る |
| 4 | API Server。Token検証、自サービス DB の役割と権限による認可、Tenant Isolation | 他テナントデータへのアクセスが拒否される |
| 5 | Tenant Logout。エラーケース対応 | エラーケース一覧のテストが通る |
| 6 | MFA、Global Logout、Refresh Tokenローテーション | 拡張シーケンスが通る |
| 7 | サービスごとの DB、管理 API による招待、サービス固有の API | 招待した人が初回ログインで紐付き、サービスの画面から役割と権限を変えられる |
| 8 | React Router v8 の SPA と薄い BFF。エンドユーザー、投稿、招待、権限編集の画面。判断事項D18 | 画面から 7 の操作ができる |
| 9 | auth の画面を `apps/auth-web` の SPA にし、auth-api が配る。判断事項D19 | ログイン、ポータル、Global Logout が SPA で通り、E8 と E11 が通る |
| 10 | shadcn/ui と Tailwind CSS v4、react-hook-form への置き換えと feature 単位のコロケーション。判断事項D20 | `pnpm chrome-check` の 14 項目が通り、空のフォームで項目ごとの検証エラーが出る |

既存システムがある適用先では、フェーズ2完了後に既存ログインを `/auth/login` へ差し替え、Cognito Tokenを直接使う箇所をAPI Server経由へ置き換える工程をフェーズ3と4の間に挟む。
