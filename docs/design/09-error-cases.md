# エラーケース一覧

## 結論

エラーは発生箇所ごとに「誰が検知するか」「どこへ返すか」「ユーザーに何を見せるか」を固定する。
不正な redirect_uri へは絶対にリダイレクトしない。詳細理由は内部ログのみに残す。

## 表記

| 列 | 意味 |
| --- | --- |
| 検知 | エラーを検知するコンポーネント |
| 応答 | 呼び出し元への応答。OAuth エラーコードは RFC 6749 / OIDC Core に従う |
| 表示 | エンドユーザーに見せる内容 |
| 副作用 | 失効やログ以外に行う処理 |

## 1. 認可リクエスト。GET /authorize

| # | ケース | 検知 | 応答 | 表示 | 副作用 |
| --- | --- | --- | --- | --- | --- |
| A1 | client_id 未登録 | Auth | 400。リダイレクトしない | Auth のエラー画面「無効なリクエストです」 | ログ |
| A2 | client status が active でない | Auth | 400。リダイレクトしない | 同上 | ログ |
| A3 | redirect_uri が client の redirect_uri_template に一致しない。別ホスト、パス違い、クエリ付き、末尾スラッシュ、大文字、多段ラベル | Auth | 400 invalid_redirect_uri。リダイレクトしない | 同上 | 警告ログ。攻撃の可能性 |
| A3b | redirect_uri はテンプレートに一致するが slug が tenants にない | Auth | 400 invalid_redirect_uri。リダイレクトしない | 同上 | 警告ログ。未登録テナントのホストへは飛ばさない |
| A4 | redirect_uri 未指定 | Auth | 400。リダイレクトしない | 同上 | ログ |
| A5 | response_type が code 以外 | Auth | 302 redirect_uri?error=unsupported_response_type&state | Tenant のエラー画面 | |
| A6 | scope に openid なし | Auth | 302 error=invalid_scope | 同上 | |
| A7 | 許可外 scope | Auth | 302 error=invalid_scope | 同上 | |
| A8 | code_challenge なし / method が S256 以外 | Auth | 302 error=invalid_request | 同上 | |
| A9 | state なし | Auth | 302 error=invalid_request | 同上 | |
| A10 | nonce なし | Auth | 302 error=invalid_request | 同上 | |
| A11 | tenant_service_members にこのテナント × このサービスの割り当てがない。別サービスの割り当てや tenant_members の会社横断の役割があっても該当する | Auth | 302 error=access_denied&error_description=no_membership&state | Tenant 403「テナント tanaka へのアクセス権がありません」 | ログ。SSO Session は維持 |
| A12 | tenant status が suspended | Auth | 302 error=access_denied&error_description=tenant_suspended | Tenant 403「テナントは利用停止中です」 | ログ |
| A13 | user status が disabled | Auth | 302 error=access_denied&error_description=user_disabled | Tenant 403「アクセス権がありません」 | ログ |
| A14 | SSO Session の Cookie はあるがストアにない | Auth | ログイン画面へ | ログインフォーム | Cookie 削除 |
| A15 | SSO Session アイドル / 絶対期限切れ | Auth | ログイン画面へ | ログインフォーム | SSO Session 削除 |
| A16 | 認可リクエスト保存失敗。ストア障害 | Auth | 302 error=server_error | Tenant「一時的なエラーです」 | アラート |
| A17 | tenant_services に契約なし / suspended | Auth | 302 error=access_denied&error_description=not_contracted | Tenant 403「テナント suzuki は CMS を契約していません」 | ログ。SSO Session は維持 |
| A18 | tenant_service_members に割り当てはあるが status が active でない | Auth | 302 error=access_denied&error_description=membership_inactive | Tenant 403「アクセス権がありません」 | ログ |

アクセス判定は A13 → A12 → A17 → A11 / A18 の順に行い、最初に失敗した理由を error_description に載せる。users、tenant_services、tenant_service_members の取得は並列に行い、評価順序だけをこの順に固定する。no_membership は「このテナントのこのサービスに割り当てがない」を意味し、テナント単位の所属の有無ではない。

## 2. ログイン。GET/POST /login

| # | ケース | 検知 | 応答 | 表示 | 副作用 |
| --- | --- | --- | --- | --- | --- |
| L1 | rid が存在しない / 期限切れ | Auth | 400 | 「ログインをやり直してください」とテナントへの戻りリンクなし | |
| L2 | CSRF トークン不一致 | Auth | 403 | 「ページを再読み込みしてください」 | 警告ログ |
| L3 | パスワード誤り | Cognito → Auth | 200 フォーム再表示 | 「ユーザー名またはパスワードが正しくありません」 | 失敗カウント |
| L4 | ユーザー不在 | Cognito → Auth | 200 フォーム再表示 | L3 と同一文言 | 失敗カウント |
| L5 | Cognito アカウントロック | Cognito → Auth | 200 フォーム再表示 | L3 と同一文言 | 警告ログ |
| L6 | UserNotConfirmed | Cognito → Auth | 200 フォーム再表示 | 「アカウントが確認されていません」 | |
| L7 | PasswordResetRequired | Cognito → Auth | 200 フォーム再表示 | 「パスワードの再設定が必要です」 | フェーズ2で導線追加 |
| L8 | MFA 等のチャレンジ応答 | Cognito → Auth | 200 フォーム再表示 | 「この認証方式は現在未対応です」。フェーズ2で /login/challenge へ | |
| L9 | Cognito 通信障害 / スロットリング | Auth | 503 | 「一時的なエラーです」 | アラート |
| L10 | Cognito IdToken 検証失敗 | Auth | 500 | 「一時的なエラーです」 | アラート。設定不整合の疑い |
| L11 | users JIT 作成失敗 | Auth | 500 | 同上 | アラート |
| L12 | レート制限超過 | Auth | 429 | 「しばらく待ってから再試行してください」 | |
| L13 | users.status が disabled | Auth | 200 フォーム再表示 | L3 と同一文言 | 警告ログ。SSO Session を作らない |
| L14 | 同じメールの users 行が既に別の cognito_sub に紐付いている | Auth | 200 フォーム再表示 | L3 と同一文言 | 警告ログ。既存行を書き換えず新規行も作らない。SSO Session を作らない |

## 3. コールバック。GET /auth/callback

| # | ケース | 検知 | 応答 | 表示 | 副作用 |
| --- | --- | --- | --- | --- | --- |
| C1 | pre-auth Cookie なし | Tenant | 400 | 「ログインをやり直してください」+ /auth/login リンク | |
| C2 | pre-auth がストアにない / 期限切れ | Tenant | 400 | 同上 | Cookie 削除 |
| C3 | state 不一致 | Tenant | 400 | 同上 | 警告ログ。code を破棄し Auth へ送らない |
| C4 | error=access_denied | Tenant | 403 | error_description に応じて表示。not_contracted「テナント suzuki は CMS を契約していません」、tenant_suspended「テナントは利用停止中です」、それ以外「テナント <slug> へのアクセス権がありません」 | pre-auth 削除 |
| C5 | error=その他 | Tenant | 400 | 「ログインに失敗しました」 | pre-auth 削除 |
| C6 | code なし | Tenant | 400 | 「ログインをやり直してください」 | |
| C7 | /token が invalid_grant | Tenant | 401 | 「ログインをやり直してください」 | pre-auth 削除 |
| C8 | /token が invalid_client | Tenant | 500 | 「一時的なエラーです」 | アラート。secret 設定不整合 |
| C9 | /token 通信障害 | Tenant | 503 | 「一時的なエラーです」 | アラート |
| C10 | id_token 署名不正 | Tenant | 401 | 「ログインをやり直してください」 | 警告ログ |
| C11 | id_token iss / aud 不一致 | Tenant | 401 | 同上 | 警告ログ |
| C12 | id_token exp 切れ | Tenant | 401 | 同上 | 時刻ずれの疑いをログ |
| C13 | id_token nonce 不一致 | Tenant | 401 | 同上 | 警告ログ。code 注入の疑い |
| C14 | JWKS 取得失敗 | Tenant | 503 | 「一時的なエラーです」 | アラート |
| C15 | Tenant Session 作成失敗 | Tenant | 503 | 同上 | アラート |
| C16 | return_to が不正 | Tenant | 302 / へ | ログイン成功。トップへ | ログ |
| C17 | id_token tenant_slug が Host のテナントと不一致 | Tenant | 401 | 「ログインをやり直してください」 | 警告ログ。他テナントの code の疑い |
| C18 | Host が自サービスの BASE_HOST に一致しない | Tenant | 404 | 「ページが見つかりません」 | ログ |

## 4. Token エンドポイント。POST /token

| # | ケース | 検知 | 応答 | 副作用 |
| --- | --- | --- | --- | --- |
| T1 | Client 認証失敗。active な secret のいずれにも一致しない。revoked 済みの secret を含む | Auth | 401 invalid_client。WWW-Authenticate: Basic | 警告ログ |
| T2 | grant_type 未対応 | Auth | 400 unsupported_grant_type | |
| T3 | code 不在 / 期限切れ | Auth | 400 invalid_grant | |
| T4 | code 再利用 | Auth | 400 invalid_grant | 同 code から発行した Refresh Token 系列を失効。警告ログ |
| T5 | code.client_id と認証 Client 不一致 | Auth | 400 invalid_grant | 警告ログ |
| T6 | redirect_uri 不一致 | Auth | 400 invalid_grant | 警告ログ |
| T7 | code_verifier なし / PKCE 不一致 | Auth | 400 invalid_grant | 警告ログ |
| T8 | 紐付く SSO Session が失効済み | Auth | 400 invalid_grant | |
| T9 | refresh_token 不在 / 期限切れ / 失効済み | Auth | 400 invalid_grant | 失効済み値の再利用なら系列全体を失効。警告ログ |
| T10 | refresh_token の client_id 不一致 | Auth | 400 invalid_grant | 警告ログ |
| T11 | Refresh 時にこのサービスへの割り当てなし / inactive | Auth | 400 invalid_grant | Refresh Token 失効 |
| T12 | Refresh 時に user disabled | Auth | 400 invalid_grant | Refresh Token を失効 |
| T15 | Refresh 時に契約なし / suspended | Auth | 400 invalid_grant | Refresh Token 失効 |
| T16 | Refresh 時に tenant suspended | Auth | 400 invalid_grant | Refresh Token 失効 |
| T13 | 署名鍵の読み込み失敗 | Auth | 500 server_error | アラート |
| T14 | ストア障害 | Auth | 503 temporarily_unavailable | アラート |

## 5. API Server

| # | ケース | 検知 | 応答 | 副作用 |
| --- | --- | --- | --- | --- |
| P1 | Authorization ヘッダなし | API | 401 invalid_request | |
| P2 | JWT 形式不正 / 署名不正 | API | 401 invalid_token | 警告ログ |
| P3 | alg が RS256 以外 | API | 401 invalid_token | 警告ログ |
| P4 | iss 不一致 | API | 401 invalid_token | 警告ログ |
| P5 | aud が Host 由来の値と不一致。他サービスの Token や ID Token の誤送信を含む | API | 401 invalid_token | ログ |
| P6 | exp 切れ | API | 401 invalid_token。error_description=expired | Tenant 側は Refresh 後に1回だけ再試行 |
| P7 | 必須 claim 欠落。sub / tenant_id / tenant_slug / sid / client_id | API | 401 invalid_token | |
| P8 | 自サービス DB の members に行がない | API | defaultRole で行を作って続行 | ログ。email と name は NULL |
| P9 | members.status が disabled | API | 403 forbidden | ログ。テナント単位で監視 |
| P10 | users や tenants の停止、割り当ての削除 | Auth | API は検知しない。Refresh で invalid_grant になり最大 15 分で失効 | |
| P11 | permission 不足。役割の既定にない場合と、自サービス DB の permission_overrides の deny で外された場合の両方 | API | 403 forbidden | ログ |
| P12 | 他テナントのリソース ID | API | 404 not_found。存在の有無を漏らさない | 403 の代わりに 404 を使う理由をコードコメントに残す |
| P13 | JWKS 取得失敗かつキャッシュなし | API | 503 temporarily_unavailable | アラート |
| P14 | 自サービスの DB 障害 | API | 500 server_error | アラート。他サービスと Auth Server には影響しない |
| P15 | RLS 設定漏れ。app.tenant_id 未設定 | DB | クエリが 0 件になる | 起動時テストで検知する |
| P16 | Host が API_BASE_URL のホストと一致しない | API | 404 not_found。Token 検証に進まない | ログ |
| P17 | body の JSON が不正、または role / permission が ServiceDefinition の語彙にない | API | 400 invalid_request | CRM の admin を CMS に送った場合を含む |
| P18 | body が 64 KB を超える | API | 413 | |

## 5.1 管理アカウント。/v1/members

| # | ケース | 検知 | 応答 | 副作用 |
| --- | --- | --- | --- | --- |
| Q1 | 招待で Auth Server が tenant_not_found / not_contracted | API | 403 | サービスの DB に行を作らない |
| Q2 | 削除で Auth Server が user_not_found | API | 自 DB の行を消して 204 | Auth Server 側に割り当てがなくても自 DB を整える |
| Q3 | Auth Server に到達できない / 5 秒でタイムアウト / 応答が解釈できない | API | 503 temporarily_unavailable | アラート。招待は再試行で冪等 |
| Q4 | 自分自身を削除 | API | 400 cannot_remove_self | |
| Q5 | 役割変更、上書き、削除の対象が members にない | API | 404 not_found | |
| Q6 | 上書きが 50 件を超える | API | 400 invalid_request | |

## 5.2 Auth Server の管理 API。/admin/service-members

| # | ケース | 検知 | 応答 | 副作用 |
| --- | --- | --- | --- | --- |
| R1 | Client 認証失敗。Basic なし、secret 不一致、revoked 済み | Auth | 401 invalid_client。WWW-Authenticate: Basic realm="admin" | 警告ログ |
| R2 | tenant_id が不正、body の形式が不正 | Auth | 400 invalid_request | |
| R3 | tenant_id が tenants にない | Auth | 404 tenant_not_found | |
| R4 | テナントが呼び出し元のサービスを契約していない / suspended | Auth | 403 not_contracted | |
| R5 | 削除の user_id が users にない | Auth | 404 user_not_found | |
| R6 | 招待のメールが users にある | Auth | 既存の行に割り当てを upsert して 201。linked は cognito_sub の有無 | 冪等。既に割り当てがあれば active に戻す |
| R7 | レート制限超過 | Auth | 429 | |

## 6. Logout

| # | ケース | 検知 | 応答 | 副作用 |
| --- | --- | --- | --- | --- |
| O1 | Tenant Logout の CSRF 不一致 | Tenant | 403 | 警告ログ |
| O2 | Tenant Logout でセッションなし | Tenant | 302 /。冪等 | |
| O3 | /revoke 失敗 | Tenant | Tenant Session は削除して 302 | Refresh Token は期限で失効。ログ |
| O4 | Global Logout の CSRF 不一致 | Auth | 403 | |
| O5 | Back-Channel Logout 通知失敗 | Auth | 完了扱い | 対象サービスの全テナントの Session は Refresh 失敗で最大15分以内に失効。ログ |
| O6 | logout_token 検証失敗 / aud が未知のサービス | Tenant | 400 | 警告ログ。セッションは削除しない |
| O7 | Global Logout の client_id が未登録、または tenant が slug 形式でない | Auth | ログアウトは実行。完了画面はポータルへのリンクのみ。戻り先は redirect_uri_template の展開からしか作らない | |

## 7. 運用系

| # | ケース | 検知 | 対処 |
| --- | --- | --- | --- |
| M1 | 署名鍵ローテーション中に旧 kid の Token | Tenant / API | JWKS に旧鍵が残っていれば検証成功。削除は Token 最大寿命経過後 |
| M2 | Client secret ローテーション中 | Auth | oidc_client_secrets に新旧 2 行が active の間はどちらでも `/token` を通す。サービスの `CLIENT_SECRET` 切替後に旧行を revoked にする |
| M3 | 時刻ずれ | Tenant / API | 30 秒の許容スキュー。NTP 同期を必須にする |
| M4 | テナント削除 | Auth / API | tenant_members / tenant_services / tenant_service_members を CASCADE 削除。oidc_clients は残る。redirect_uri はテンプレート由来のため削除対象がない。既存 Token は Refresh で拒否。サービスの DB の members と業務データは各サービスが tenant_id で消す |
| M6 | 契約解除 | Auth | tenant_services を削除または suspended。削除すれば tenant_service_members も CASCADE で消える。`/authorize` と Refresh で not_contracted。既存 Access Token は最大15分で失効 |
| M8 | サービスからの割り当て解除 | Auth / API | `DELETE /v1/members/:userId` が Auth Server の割り当てを消してから自 DB の行を消す。`/authorize` と Refresh で no_membership、既存 Access Token は最大 15 分で失効。同テナントの他サービスには影響しない |
| M9 | 役割と権限の上書き変更 | API | `PATCH /v1/members/:userId` と `PUT /v1/members/:userId/permissions` で自サービス DB を更新。Token を再発行せず次のリクエストから反映される |
| M10 | 招待した人が初回ログインするまで | Auth | users に cognito_sub が NULL の行と割り当てがあり、サービスの DB に member 行がある。`linked: false`。初回ログインで同じメールの行に sub が紐付く |
| M7 | サービス廃止 | Auth / Tenant | oidc_clients を disabled。A2 で拒否。oidc_client_secrets と tenant_services は oidc_clients.id を参照するため行を消せば CASCADE で消える。そのサービスの web と api のプロセスを停止し、provision の SERVICES から除く |
| M5 | Cognito でユーザー削除 | Auth | 次回ログインで L4。既存 SSO Session は期限まで残るため、削除時に SSO Session を失効させる運用を定義。`/admin/service-members` は割り当てしか扱わない |

## ユーザー向けメッセージ方針

- 認証失敗はすべて同一文言。ユーザー列挙を防ぐ
- 一時的エラーは「一時的なエラーです。しばらくしてから再試行してください」に統一
- ログインやり直しは Tenant の `/auth/login` へのリンクを添える
- エラー画面に Token、code、state、内部 ID を表示しない
- 内部ログには理由コードを必ず記録し、ユーザー向け文言と対応付けられるようにする
