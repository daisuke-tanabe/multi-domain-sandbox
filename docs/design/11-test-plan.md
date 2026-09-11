# テスト計画

## 結論

テストは Unit / Integration / E2E / Security の4層で構成する。
E2E は「初回ログイン」「別テナント SSO」「Tenant Logout」「他テナントデータ拒否」「別サービス SSO と契約判定」の5シナリオを必須とし、これが通ることを各フェーズの完了条件にする。
エラーケース一覧の各行を Integration テストに1対1で対応させる。
現在の自動テストは auth-server / api-server / tenant-web / oidc-client / shared で 112 件が通っている。

## テストピラミッド

| 層 | 対象 | ツール | 実行タイミング |
| --- | --- | --- | --- |
| Unit | PKCE 計算、JWT 生成と検証、Cookie 属性、redirect_uri 比較、Host 解決、return_to 検証、Role→Permission | Vitest | 毎コミット |
| Integration | Auth / Tenant / API の各エンドポイント。ストアと Cognito はモック | Vitest + Hono テストクライアント | 毎コミット |
| E2E | 3種のプロセスと6ホストをまたぐフロー。ブラウザ相当のクライアントで Cookie を追う | Vitest。ブラウザ確認は Chrome DevTools スクリプト | PR ごと |
| Security | 攻撃シナリオの再現 | Vitest | PR ごと |

## Unit テスト

### Auth Server

| 対象 | ケース |
| --- | --- |
| PKCE | S256 の計算。verifier 長の下限上限。plain の拒否 |
| redirect_uri 比較 | 完全一致のみ true。末尾スラッシュ、クエリ、大文字小文字、ポートの差異で false |
| テナント解決 | (client_id, redirect_uri) から tenant_id を引く。tenant_id NULL の行はテナントなし |
| アクセス判定 | user_disabled → tenant_suspended → not_contracted → no_membership / membership_inactive の順で最初の理由を返す |
| ID Token 生成 | 必須 claims の存在。aud=client_id。nonce / sid / tenant_id / tenant_slug の反映 |
| Access Token 生成 | aud に client.audience と issuer。role を含まない。tenant_id と client_id の反映 |
| logout_token 生成 | aud=client_id。sid と events。nonce なし |
| Cognito Token 暗号化 | 暗号化して復号で元に戻る。鍵 ID が保存される |
| Cognito アダプタ | 例外種別ごとの理由コード写像 |
| セッション寿命 | アイドルと絶対の判定境界 |

### Tenant Web Application と OIDC Client モジュール

| 対象 | ケース |
| --- | --- |
| Host 解決 | tanaka.crm.localhost:3001 → service=crm, tenantSlug=tanaka。baseHost に一致しない Host は 404。ラベルが2段以上の Host は拒否 |
| SERVICES 設定 | JSON の必須項目。clientId 重複の拒否 |
| return_to 検証 | 相対パス許可。絶対 URL / `//` / `javascript:` / `\` 拒否 |
| ID Token 検証 | 署名 / iss / aud / exp / nonce / alg 固定 / tenant_slug と Host の一致 |
| Cookie 生成 | HttpOnly / Secure / SameSite=Lax / `__Host-` / Domain なし |
| Session キー | `<clientId>:<tenantSlug>:<id>`。同じ Cookie 値でも別ホストから引けない |
| sid 逆引き | `<clientId>:sid:<sid>` に複数テナントのセッションが入り、まとめて削除できる |
| Token 更新判定 | 残り60秒未満で Refresh を発火 |

### API Server

| 対象 | ケース |
| --- | --- |
| Host → aud | API_HOSTS の各 Host が `<PUBLIC_SCHEME>://<host>` に写像される |
| Access Token 検証 | aud 不一致で拒否。ID Token を渡すと拒否。alg=none 拒否 |
| Role→Permission | 4 role の permission 集合 |
| Repository | tenant_id 引数の必須性。省略で型エラーになること |

## Integration テスト

エラーケース一覧の番号をテスト名に含める。

### Auth Server

| 番号 | テスト |
| --- | --- |
| A1-A4 | リダイレクトせず 400 を返し、Location ヘッダがないこと。A3 は未登録テナントのホストを含む |
| A5-A10 | redirect_uri へ error と state 付きで 302 |
| A11-A13, A17, A18 | access_denied と error_description の理由。SSO Session は維持される |
| A14-A15 | ログイン画面へ遷移し Cookie が削除される |
| L1-L12 | 各エラーの応答と文言。L3-L5 が同一文言 |
| T1-T16 | 各エラーの OAuth エラーコード。T4 で Refresh Token 系列が失効。T15 で契約解除後の Refresh が invalid_grant |
| 正常 | code 交換で id_token / access_token / refresh_token が返る。expires_in=900 |
| 正常 | id_token の aud が client_id、tenant_slug が redirect_uri のテナント |
| 正常 | access_token の aud が client.audience。crm と cms で異なる |
| 正常 | refresh_token grant でローテーションされ、旧値が失効する |
| 正常 | /revoke が冪等 |
| 正常 | /.well-known/openid-configuration と /jwks の内容 |
| ポータル | alice で「Tanaka Inc. (tanaka / owner)」に CRM と CMS、「Suzuki Ltd. (suzuki / viewer)」に CRM のみ。リンクは `<tenant>.<service>` の /auth/login |
| Global Logout | authorized_clients のサービスごとに1通の logout_token。aud がサービス。完了画面に「CRM (tanaka) に戻る」 |

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

### API Server

| 番号 | テスト |
| --- | --- |
| P1-P14 | 各エラー応答 |
| P5 | crm 向け Access Token を Host api.cms.localhost:3002 に送ると 401 |
| P16 | API_HOSTS にない Host は 404。Token の有無に関わらず |
| 正常 | cms 向け Access Token を Host api.cms.localhost:3002 に送ると 200 |
| 正常 | 有効な Token で自テナントのデータのみ返る |
| P12 | 他テナントのリソース ID で 404 |
| 権限 | viewer で projects:write が 403 |
| Membership | Token 有効中に tenant_members を削除すると次のリクエストで 403 |
| role | Token に role claim があっても無視し DB の role を使う |
| RLS | app.tenant_id 未設定で 0 件。PostgreSQL 使用時のみ |

## E2E テスト

ローカルでは `auth.localhost:3000`、`tanaka.crm.localhost:3001` `suzuki.crm.localhost:3001` `tanaka.cms.localhost:3001` `suzuki.cms.localhost:3001`、`api.crm.localhost:3002` `api.cms.localhost:3002` を起動し、Cognito はモックアダプタを使う。ユーザーは alice。tanaka の owner かつ suzuki の viewer。

| # | シナリオ | 確認内容 |
| --- | --- | --- |
| E1 | 初回ログイン | tanaka.crm 未ログイン → ログイン画面 → 認証 → Tanaka Project 1 / 2 を表示。Cookie が tanaka.crm と auth にそれぞれ1つ。Domain 属性なし |
| E2 | 別テナント SSO | E1 後に suzuki.crm へアクセス → ログイン画面を経由せず Suzuki Project 1 を表示。ネットワークログにログイン画面の GET がないこと |
| E3 | Tenant Logout | tanaka.crm でログアウト → tanaka.crm は未ログイン、suzuki.crm と tanaka.cms はログイン済み。auth の Cookie は残る |
| E4 | 他テナントデータ拒否 | tanaka.crm のセッションで suzuki の project ID を指定 → 404 |
| E5 | Membership なし | どのテナントにも所属しない carol が tanaka.crm へアクセス → 403 アクセス権なし画面。ログイン画面は出ない。SSO Session は残る |
| E6 | Tenant Session 期限切れ復帰 | tanaka.crm の Session を強制失効 → 再アクセスで無画面復帰 |
| E7 | SSO Session 期限切れ | SSO Session を強制失効 → suzuki.crm へアクセスでログイン画面 |
| E8 | 認証失敗 | パスワード誤りでフォーム再表示。SSO Cookie が発行されない |
| E9 | 再訪 | E1 後に tanaka.crm を再読み込み → auth への通信が発生しない |
| E10 | role の差 | 同じ alice が tanaka では project を作成でき、suzuki では viewer のため 403 |
| E11 | Global Logout | auth の `/logout?client_id=crm&tenant=tanaka` でログアウト → tanaka.crm / suzuki.crm 両方が未ログイン。完了画面に「CRM (tanaka) に戻る」 |
| E12 | 別サービス SSO と契約判定 | E1 後に tanaka.cms へアクセス → ログイン画面なしで code を取得し cms 向け Token でログイン。suzuki.cms へアクセス → 403「テナント suzuki は CMS を契約していません」。crm から Global Logout → Back-Channel で tanaka.cms も未ログイン |

各シナリオで以下を横断的に検証する。

- URL、Cookie、HTML、ネットワークログのいずれにも JWT が現れない
- サーバーログに Token / Cookie 値 / code が出力されない
- 各ホストの Cookie が他ホストに送られない

## Security テスト

| # | シナリオ | 期待 |
| --- | --- | --- |
| S1 | code 再利用 | 2回目が invalid_grant。1回目で得た Refresh Token が失効 |
| S2 | state 改ざん | Tenant が 400。/token が呼ばれない |
| S3 | redirect_uri 改ざん。別ホスト / パス違い / クエリ追加 / 未登録テナント | Auth が 400。Location なし |
| S4 | 別ブラウザへの code 注入 | nonce 不一致で 401 |
| S5 | crm の code を cms の secret で交換 | invalid_grant |
| S6 | Refresh Token 再利用 | 系列全体が失効し、正規の次回 Refresh も失敗する |
| S7 | ID Token を API に送る | 401 |
| S8 | alg=none / HS256 の偽造 Token | 401 |
| S9 | Token の tenant_id を書き換え | 署名不正で 401 |
| S10 | X-Tenant-Id ヘッダやパスで他テナント指定 | 無視され自テナントのデータのみ |
| S11 | Cookie の Domain を .sandbox.com にして送信 | `__Host-` 名で受理されない |
| S12 | ログイン POST を CSRF トークンなしで送信 | 403 |
| S13 | ログアウト POST を別オリジンから送信 | 403 |
| S14 | パスワードスプレー | 429 |
| S15 | 存在ユーザーと非存在ユーザーの応答比較 | 文言と応答時間の差がない |
| S16 | crm の Access Token を api.cms に送る | aud 不一致で 401 |
| S17 | suzuki 向けの code を tanaka.crm の callback で受ける | redirect_uri 不一致で invalid_grant。通過しても tenant_slug 不一致で 401 |
| S18 | 契約のない suzuki.cms の redirect_uri で /authorize | access_denied not_contracted。code は発行されない |

## テスト環境

| 項目 | 内容 |
| --- | --- |
| Cognito | `CognitoAuthenticator` インターフェースのモック実装。固定ユーザー alice / bob / carol と失敗パターンを設定できる |
| Session Store | インメモリ実装。TTL を進めるためのテスト用クロック |
| Identity DB | ローカル PostgreSQL。RLS テストは PostgreSQL 必須 |
| SERVICES | crm と cms の2サービス。baseHost は crm.localhost:3001 / cms.localhost:3001 |
| API_HOSTS | api.crm.localhost:3002 / api.cms.localhost:3002 |
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
| 4. API Server | E4 / E10 / P 系 / S7-S10 / S16 |
| 5. Logout とエラー | E3 / E5-E7 / 全エラーケース / S1-S6 / S11-S15 / S17-S18 |
| 6. 拡張 | E11 / MFA シーケンス |
