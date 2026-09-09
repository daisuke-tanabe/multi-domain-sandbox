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
| A3 | redirect_uri 不一致 | Auth | 400。リダイレクトしない | 同上 | 警告ログ。攻撃の可能性 |
| A4 | redirect_uri 未指定 | Auth | 400。リダイレクトしない | 同上 | ログ |
| A5 | response_type が code 以外 | Auth | 302 redirect_uri?error=unsupported_response_type&state | Tenant のエラー画面 | |
| A6 | scope に openid なし | Auth | 302 error=invalid_scope | 同上 | |
| A7 | 許可外 scope | Auth | 302 error=invalid_scope | 同上 | |
| A8 | code_challenge なし / method が S256 以外 | Auth | 302 error=invalid_request | 同上 | |
| A9 | state なし | Auth | 302 error=invalid_request | 同上 | |
| A10 | nonce なし | Auth | 302 error=invalid_request | 同上 | |
| A11 | SSO Session あり、tenant_members なし | Auth | 302 error=access_denied&state | Tenant「このテナントへのアクセス権がありません」 | ログ |
| A12 | tenant status が suspended | Auth | 302 error=access_denied | Tenant「このテナントは利用停止中です」 | ログ |
| A13 | user status が disabled | Auth | 302 error=access_denied | Tenant「アカウントが無効です」 | SSO Session 削除 |
| A14 | SSO Session の Cookie はあるがストアにない | Auth | ログイン画面へ | ログインフォーム | Cookie 削除 |
| A15 | SSO Session アイドル / 絶対期限切れ | Auth | ログイン画面へ | ログインフォーム | SSO Session 削除 |
| A16 | 認可リクエスト保存失敗。ストア障害 | Auth | 302 error=server_error | Tenant「一時的なエラーです」 | アラート |

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

## 3. コールバック。GET /auth/callback

| # | ケース | 検知 | 応答 | 表示 | 副作用 |
| --- | --- | --- | --- | --- | --- |
| C1 | pre-auth Cookie なし | Tenant | 400 | 「ログインをやり直してください」+ /auth/login リンク | |
| C2 | pre-auth がストアにない / 期限切れ | Tenant | 400 | 同上 | Cookie 削除 |
| C3 | state 不一致 | Tenant | 400 | 同上 | 警告ログ。code を破棄し Auth へ送らない |
| C4 | error=access_denied | Tenant | 200 | 「このテナントへのアクセス権がありません」 | pre-auth 削除 |
| C5 | error=その他 | Tenant | 200 | 「ログインに失敗しました」 | pre-auth 削除 |
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

## 4. Token エンドポイント。POST /token

| # | ケース | 検知 | 応答 | 副作用 |
| --- | --- | --- | --- | --- |
| T1 | Client 認証失敗 | Auth | 401 invalid_client。WWW-Authenticate: Basic | 警告ログ |
| T2 | grant_type 未対応 | Auth | 400 unsupported_grant_type | |
| T3 | code 不在 / 期限切れ | Auth | 400 invalid_grant | |
| T4 | code 再利用 | Auth | 400 invalid_grant | 同 code から発行した Refresh Token 系列を失効。警告ログ |
| T5 | code.client_id と認証 Client 不一致 | Auth | 400 invalid_grant | 警告ログ |
| T6 | redirect_uri 不一致 | Auth | 400 invalid_grant | 警告ログ |
| T7 | code_verifier なし / PKCE 不一致 | Auth | 400 invalid_grant | 警告ログ |
| T8 | 紐付く SSO Session が失効済み | Auth | 400 invalid_grant | |
| T9 | refresh_token 不在 / 期限切れ / 失効済み | Auth | 400 invalid_grant | 失効済み値の再利用なら系列全体を失効。警告ログ |
| T10 | refresh_token の client_id 不一致 | Auth | 400 invalid_grant | 警告ログ |
| T11 | Refresh 時に Membership なし | Auth | 400 invalid_grant | Refresh Token 失効 |
| T12 | Refresh 時に user disabled | Auth | 400 invalid_grant | Refresh Token と SSO Session を失効 |
| T13 | 署名鍵の読み込み失敗 | Auth | 500 server_error | アラート |
| T14 | ストア障害 | Auth | 503 temporarily_unavailable | アラート |

## 5. API Server

| # | ケース | 検知 | 応答 | 副作用 |
| --- | --- | --- | --- | --- |
| P1 | Authorization ヘッダなし | API | 401 invalid_request | |
| P2 | JWT 形式不正 / 署名不正 | API | 401 invalid_token | 警告ログ |
| P3 | alg が RS256 以外 | API | 401 invalid_token | 警告ログ |
| P4 | iss 不一致 | API | 401 invalid_token | 警告ログ |
| P5 | aud が api.sandbox.com でない。ID Token の誤送信を含む | API | 401 invalid_token | ログ |
| P6 | exp 切れ | API | 401 invalid_token。error_description=expired | Tenant 側は Refresh 後に1回だけ再試行 |
| P7 | 必須 claim 欠落 | API | 401 invalid_token | |
| P8 | users.status が disabled | API | 401 | ログ |
| P9 | tenant_members なし | API | 403 forbidden | ログ。テナント単位で監視 |
| P10 | tenant status が suspended | API | 403 forbidden | |
| P11 | permission 不足 | API | 403 forbidden | ログ |
| P12 | 他テナントのリソース ID | API | 404 not_found。存在の有無を漏らさない | 403 の代わりに 404 を使う理由をコードコメントに残す |
| P13 | JWKS 取得失敗かつキャッシュなし | API | 503 | アラート |
| P14 | Identity DB 障害 | API | 503 | アラート。キャッシュがあれば寿命内のみ利用 |
| P15 | RLS 設定漏れ。app.tenant_id 未設定 | DB | クエリが 0 件になる | 起動時テストで検知する |

## 6. Logout

| # | ケース | 検知 | 応答 | 副作用 |
| --- | --- | --- | --- | --- |
| O1 | Tenant Logout の CSRF 不一致 | Tenant | 403 | 警告ログ |
| O2 | Tenant Logout でセッションなし | Tenant | 302 /。冪等 | |
| O3 | /revoke 失敗 | Tenant | Tenant Session は削除して 302 | Refresh Token は期限で失効。ログ |
| O4 | Global Logout の CSRF 不一致 | Auth | 403 | |
| O5 | Back-Channel Logout 通知失敗 | Auth | 完了扱い | 対象 Tenant は Refresh 失敗で最大15分以内に失効。ログ |
| O6 | logout_token 検証失敗 | Tenant | 400 | 警告ログ。セッションは削除しない |

## 7. 運用系

| # | ケース | 検知 | 対処 |
| --- | --- | --- | --- |
| M1 | 署名鍵ローテーション中に旧 kid の Token | Tenant / API | JWKS に旧鍵が残っていれば検証成功。削除は Token 最大寿命経過後 |
| M2 | Client secret ローテーション中 | Auth | 新旧 2 世代を受け付ける猶予期間 |
| M3 | 時刻ずれ | Tenant / API | 30 秒の許容スキュー。NTP 同期を必須にする |
| M4 | テナント削除 | Auth / API | oidc_clients CASCADE 削除。既存 Token は Membership 再検証で拒否 |
| M5 | Cognito でユーザー削除 | Auth | 次回ログインで L4。既存 SSO Session は期限まで残るため、削除時に Auth の管理 API から SSO Session を失効させる運用を定義 |

## ユーザー向けメッセージ方針

- 認証失敗はすべて同一文言。ユーザー列挙を防ぐ
- 一時的エラーは「一時的なエラーです。しばらくしてから再試行してください」に統一
- ログインやり直しは Tenant の `/auth/login` へのリンクを添える
- エラー画面に Token、code、state、内部 ID を表示しない
- 内部ログには理由コードを必ず記録し、ユーザー向け文言と対応付けられるようにする
