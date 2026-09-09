# テスト計画

## 結論

テストは Unit / Integration / E2E / Security の4層で構成する。
E2E は「初回ログイン」「別テナント SSO」「Tenant Logout」「他テナントデータ拒否」の4シナリオを必須とし、これが通ることを各フェーズの完了条件にする。
エラーケース一覧の各行を Integration テストに1対1で対応させる。

## テストピラミッド

| 層 | 対象 | ツール | 実行タイミング |
| --- | --- | --- | --- |
| Unit | PKCE 計算、JWT 生成と検証、Cookie 属性、redirect_uri 比較、return_to 検証、Role→Permission | Vitest | 毎コミット |
| Integration | Auth / Tenant / API の各エンドポイント。ストアと Cognito はモック | Vitest + Hono テストクライアント | 毎コミット |
| E2E | ブラウザで3ホストをまたぐフロー | Playwright | PR ごと |
| Security | 攻撃シナリオの再現 | Vitest + Playwright | PR ごと |

## Unit テスト

### Auth Server

| 対象 | ケース |
| --- | --- |
| PKCE | S256 の計算。verifier 長の下限上限。plain の拒否 |
| redirect_uri 比較 | 完全一致のみ true。末尾スラッシュ、クエリ、大文字小文字、ポートの差異で false |
| ID Token 生成 | 必須 claims の存在。aud=client_id。nonce / sid / tenant_id の反映 |
| Access Token 生成 | aud=api。role を含まない。tenant_id の反映 |
| Cognito Token 暗号化 | 暗号化して復号で元に戻る。鍵 ID が保存される |
| Cognito アダプタ | 例外種別ごとの理由コード写像 |
| セッション寿命 | アイドルと絶対の判定境界 |

### Tenant Web Application

| 対象 | ケース |
| --- | --- |
| return_to 検証 | 相対パス許可。絶対 URL / `//` / `javascript:` / `\` 拒否 |
| ID Token 検証 | 署名 / iss / aud / exp / nonce / alg 固定 |
| Cookie 生成 | HttpOnly / Secure / SameSite=Lax / `__Host-` / Domain なし |
| Token 更新判定 | 残り60秒未満で Refresh を発火 |

### API Server

| 対象 | ケース |
| --- | --- |
| Access Token 検証 | aud 不一致で拒否。ID Token を渡すと拒否。alg=none 拒否 |
| Role→Permission | 4 role の permission 集合 |
| Repository | tenant_id 引数の必須性。省略で型エラーになること |

## Integration テスト

エラーケース一覧の番号をテスト名に含める。

### Auth Server

| 番号 | テスト |
| --- | --- |
| A1-A4 | リダイレクトせず 400 を返し、Location ヘッダがないこと |
| A5-A10 | redirect_uri へ error と state 付きで 302 |
| A11-A13 | access_denied。A13 で SSO Session が削除される |
| A14-A15 | ログイン画面へ遷移し Cookie が削除される |
| L1-L12 | 各エラーの応答と文言。L3-L5 が同一文言 |
| T1-T14 | 各エラーの OAuth エラーコード。T4 で Refresh Token 系列が失効 |
| 正常 | code 交換で id_token / access_token / refresh_token が返る。expires_in=900 |
| 正常 | refresh_token grant でローテーションされ、旧値が失効する |
| 正常 | /revoke が冪等 |
| 正常 | /.well-known/openid-configuration と /jwks の内容 |

### Tenant Web Application

| 番号 | テスト |
| --- | --- |
| C1-C16 | 各エラーの応答とセッション未作成 |
| 正常 | /auth/login が正しいパラメータで /authorize へ 302。pre-auth Cookie の属性 |
| 正常 | /auth/callback がセッション Cookie を新規発行し、pre-auth Cookie を削除する |
| 正常 | 既存セッションがある状態の /auth/callback でセッション ID が変わる |
| O1-O3 | Tenant Logout |
| 正常 | apiFetch が Bearer を付与し、期限切れ時に Refresh 後1回だけ再試行する |

### API Server

| 番号 | テスト |
| --- | --- |
| P1-P14 | 各エラー応答 |
| 正常 | 有効な Token で自テナントのデータのみ返る |
| P12 | 他テナントのリソース ID で 404 |
| 権限 | viewer で projects:write が 403 |
| Membership | Token 有効中に tenant_members を削除すると次のリクエストで 403 |
| RLS | app.tenant_id 未設定で 0 件。PostgreSQL 使用時のみ |

## E2E テスト

ローカルでは `auth.localhost` `tenant-a.localhost` `tenant-b.localhost` `api.localhost` を別ポートで起動し、Cognito はモックアダプタを使う。

| # | シナリオ | 確認内容 |
| --- | --- | --- |
| E1 | 初回ログイン | tenant-a 未ログイン → ログイン画面 → 認証 → tenant-a のページ表示。Cookie が tenant-a と auth にそれぞれ1つ。Domain 属性なし |
| E2 | 別テナント SSO | E1 後に tenant-b へアクセス → ログイン画面を経由せず tenant-b のページ表示。ネットワークログにログイン画面の GET がないこと |
| E3 | Tenant Logout | tenant-a でログアウト → tenant-a は未ログイン、tenant-b はログイン済み。auth の Cookie は残る |
| E4 | 他テナントデータ拒否 | tenant-a のセッションで tenant-b の project ID を指定 → 404 |
| E5 | Membership なし | tenant-c への所属がないユーザーが tenant-c へアクセス → アクセス権なし画面。ログイン画面は出ない |
| E6 | Tenant Session 期限切れ復帰 | tenant-a の Session を強制失効 → 再アクセスで無画面復帰 |
| E7 | SSO Session 期限切れ | SSO Session を強制失効 → tenant-b へアクセスでログイン画面 |
| E8 | 認証失敗 | パスワード誤りでフォーム再表示。SSO Cookie が発行されない |
| E9 | 再訪 | E1 後に tenant-a を再読み込み → auth への通信が発生しない |
| E10 | Global Logout。フェーズ2 | auth でログアウト → tenant-a / tenant-b 両方が未ログイン |

各シナリオで以下を横断的に検証する。

- URL、Cookie、HTML、ネットワークログのいずれにも JWT が現れない
- サーバーログに Token / Cookie 値 / code が出力されない

## Security テスト

| # | シナリオ | 期待 |
| --- | --- | --- |
| S1 | code 再利用 | 2回目が invalid_grant。1回目で得た Refresh Token が失効 |
| S2 | state 改ざん | Tenant が 400。/token が呼ばれない |
| S3 | redirect_uri 改ざん。別ホスト / パス違い / クエリ追加 | Auth が 400。Location なし |
| S4 | 別ブラウザへの code 注入 | nonce 不一致で 401 |
| S5 | tenant-a の code を tenant-b の secret で交換 | invalid_grant |
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

## テスト環境

| 項目 | 内容 |
| --- | --- |
| Cognito | `CognitoAuthenticator` インターフェースのモック実装。固定ユーザーと失敗パターンを設定できる |
| Session Store | インメモリ実装。TTL を進めるためのテスト用クロック |
| Identity DB | ローカル PostgreSQL または SQLite。RLS テストは PostgreSQL 必須 |
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
| 3. Tenant Web Application | E1 / E2 / E8 / E9 |
| 4. API Server | E4 / P 系 / S7-S10 |
| 5. Logout とエラー | E3 / E5-E7 / 全エラーケース / S1-S6 / S11-S15 |
| 6. 拡張 | E10 / MFA シーケンス |
