# 現状分析と判断が必要な事項

## 結論

本リポジトリは新規サンドボックスであり、既存の認証実装・DB・インフラは存在しない。
したがって仕様書22章の調査対象はなく、24章の「現状分析 / 現在の認証フロー / 現在の問題点 / 移行計画」はグリーンフィールド前提で記述する。
推奨アーキテクチャは OIDC Authorization Code Flow + PKCE を用いた独立OpenID Provider方式とし、Tenant Web ApplicationはBFF構成とする。
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
| CORS / CSRF | 存在しない。BFF構成ならブラウザからapi.sandbox.comへの直接呼び出しがなくCORSは不要 |
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
| Client登録 | テナントごとに1 Client。テナント作成時に自動登録 |
| テナントアクセス可否 | `/authorize` 時にAuth ServerがTenant Membershipを検証 |
| API認証 | Auth Server発行のAccess Token。JWT RS256。aud=api.sandbox.com。BFFがサーバー間で送信 |
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
| D2 | テナントごとに1 Client |
| D3 | Auth Server が Identity DB を所有 |
| D4 | Auth Server 発行の Refresh Token をローテーション |
| D5-D12 | 推奨値どおり |
| 追加 | ID Token の sub は内部の users.id |
| 追加 | 検証実装の Cognito はモックアダプタのみ。本番アダプタは雛形のみ |
| 追加 | 検証実装の DB は PostgreSQL on Docker。RLS を検証する |
| 追加 | MFA はフェーズ2。Global Logout は当初フェーズ2としたが、Tenant Logout 後に再ログインされる挙動が分かりにくいため 2026-09-09 に前倒しで実装 |

### D1. Tenant Web Applicationの実行形態

問題点。Tenant Web ApplicationがサーバーサイドセッションをもつBFFか、ブラウザ完結のSPAかで、API認証とCookie設計が根本的に変わる。仕様書4.3は「自サービスセッションの管理」と「api.sandbox.comへのAPIアクセス」をTenant Web Applicationの責務としているが、実行形態は明記していない。

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A. BFF構成。Next.js等のサーバーがセッションを持ち、APIをサーバー間で呼ぶ | ブラウザにTokenを置かない。Cookieだけで完結。CORS不要。仕様書の責務分離にそのまま合致 | Tenant Web Applicationにサーバーが必要 |
| B. SPA + ブラウザ保持Token | サーバーレスで配信できる | Tokenがブラウザに露出しXSSで漏洩。Refresh Tokenの扱いが難しい。api.sandbox.comへCORSが必要 |
| C. SPA + api.sandbox.com独自Cookie | ブラウザにTokenを置かない | api.sandbox.comが独自にセッションを持つことになり、もう1つのOIDC Clientとして扱う必要がある。責務境界が曖昧になる |

推奨はA。理由は、仕様書2.3と18章のToken非露出要件と、20章のCookie要件を最も自然に満たすため。本設計書はAを前提に記述している。

### D2. OIDC Clientの登録単位

問題点。テナントが増えるたびにClientを手動登録すると運用が破綻する。一方、ワイルドカードredirect_uriは仕様書11章で禁止されている。

| 選択肢 | メリット | デメリット |
| --- | --- | --- |
| A. テナントごとに1 Client。テナント作成時に自動登録 | aud=テナントとなりTokenのテナント境界が明確。別ドメインサービス追加と同じ仕組みで扱える。仕様書11章の記述と一致 | Tenant Web Applicationがテナント数分のclient_secretを扱う。Secret Store等での管理が必要 |
| B. Tenant Web Application全体で1 Client。redirect_uriをテナント作成時に列挙追加 | Secretが1つ | 1 Clientが全テナントを代表するためaudでテナントを区別できない。redirect_uriのホストからテナントを推定する独自ロジックが必要 |

推奨はA。理由は、標準仕様の範囲でテナントコンテキストをTokenに載せられ、独立ドメインへの拡張と同じ運用で済むため。client_secretは共通のSecret Storeにslugをキーとして保存し、Tenant Web Applicationがリクエストのホストから引く。

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

推奨。`/authorize` でMembershipがない場合、redirect_uriは正当なので `error=access_denied` を付けてTenant Web Applicationへ戻し、Tenant側で「このテナントへのアクセス権がありません」を表示する。所属テナント一覧を提示する画面は拡張として扱う。

### D11. Tenant Isolationの実装レベル

推奨。アプリ層でのtenant_id強制を必須とし、PostgreSQLであれば Row Level Security を二重防御として追加する。DBがPostgreSQL以外の場合はアプリ層のみになる。

### D12. Global Logoutの実装フェーズ

推奨は初期実装で `sid` の発行と保存までとしていたが、Tenant Logout 後にリロードで再ログインされる挙動の分かりにくさから、Back-Channel Logout を含む Global Logout を前倒しで実装した。

## 5. 移行計画

グリーンフィールドのため、構築順序として記述する。

| フェーズ | 内容 | 完了条件 |
| --- | --- | --- |
| 0 | 判断事項D1からD4の決定 | 本ドキュメントの承認 |
| 1 | Identity DBとClient Registryの構築。Cognito User Pool作成 | seedデータでusers / tenants / tenant_membersが投入できる |
| 2 | Auth Server。`/authorize` `/login` `/token` `/jwks` `/userinfo` | 初回ログインシーケンスが通る |
| 3 | Tenant Web Application。OIDC Client共通モジュール | 別テナントSSOシーケンスが通る |
| 4 | API Server。Token検証とMembership認可、Tenant Isolation | 他テナントデータへのアクセスが拒否される |
| 5 | Tenant Logout。エラーケース対応 | エラーケース一覧のテストが通る |
| 6 | MFA、Global Logout、Refresh Tokenローテーション | 拡張シーケンスが通る |

既存システムがある適用先では、フェーズ2完了後に既存ログインを `/auth/login` へ差し替え、Cognito Tokenを直接使う箇所をAPI Server経由へ置き換える工程をフェーズ3と4の間に挟む。
