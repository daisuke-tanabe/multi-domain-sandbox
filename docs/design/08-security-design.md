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
| redirect_uri 厳格検証 | 完全一致。不一致時はリダイレクトしない | 06 |
| state による CSRF 対策 | pre-auth に保存し callback で一致検証 | 02, 06 |
| nonce 検証 | ID Token の nonce と pre-auth の一致検証 | 04 |
| Open Redirect 対策 | redirect_uri 完全一致。return_to は自ドメイン内パスのみ | 06 |
| Session Fixation 対策 | 認証成功時と code 交換成功時にセッション ID を新規発行 | 03 |
| Token / Cookie のログ出力禁止 | ログフィールドの許可リスト方式。秘密値は型でマーク | 本書 |
| Cognito Refresh Token のサービス間共有禁止 | Auth Server 内で暗号化保存。境界外へ出す経路を持たない | 04 |
| Cognito Token の URL 埋め込み禁止 | Front Channel を通る値は code と state のみ | 02 |
| Tenant ID だけを根拠にした認可禁止 | Token の tenant_id + tenant_members 再検証 | 07 |
| Tenant Membership による認可 | 毎リクエスト Identity DB 参照 | 07 |
| BOLA / IDOR 対策 | Repository の tenant_id 必須化と RLS | 07 |

## 脅威と対策

### 認可フロー

| 脅威 | 対策 |
| --- | --- |
| code 横取り | PKCE S256 必須。code 60秒。client_secret による Client 認証 |
| code 注入。攻撃者の code を被害者のセッションへ | state の一致検証。nonce の一致検証 |
| 認可レスポンスの差し替え | state を pre-auth に紐付け、Cookie で参照 |
| redirect_uri 操作 | 完全一致。パラメータ付きやパス違いも拒否 |
| Client なりすまし | client_secret_basic。argon2id でハッシュ保存 |
| mix-up 攻撃。複数 IdP 想定 | iss パラメータをレスポンスに含める。RFC 9207。Client は iss を検証 |
| テナント越境の code 交換 | code.client_id と認証 Client の一致検証 |

### セッション

| 脅威 | 対策 |
| --- | --- |
| Session Fixation | 認証成功時に ID 再発行 |
| Session Hijack | HttpOnly / Secure / `__Host-`。値はランダム 256bit |
| 長期放置 | アイドルと絶対の二重タイムアウト |
| Cookie のサブドメインからの上書き | `__Host-` により Domain 指定を不可能にする |
| CSRF。ログイン POST / Logout POST | 同期トークン方式。Cookie 参照 ID とフォーム値の一致 |
| Login CSRF | ログインフォームの CSRF トークンと rid の紐付け |

### Token

| 脅威 | 対策 |
| --- | --- |
| Token 漏洩 | ブラウザに置かない。サーバー側ストアのみ |
| Refresh Token 再利用 | ローテーションと系列失効 |
| 鍵漏洩 | 秘密鍵は Auth Server のみ。Secret Store から起動時読み込み。ローテーション手順を定義 |
| alg 混同 | 検証時に alg を RS256 に固定。none と HS256 を拒否 |
| aud 取り違え | ID Token と Access Token で aud を分ける。API は aud を必ず検証 |
| Cognito Token の露出 | 保存時暗号化。ログ禁止。応答に含めない |

### テナント分離

| 脅威 | 対策 |
| --- | --- |
| Tenant ID 改ざん | Token 以外の tenant_id を認可に使わない |
| IDOR / BOLA | 単一リソース取得も tenant_id 条件付き。RLS |
| 権限昇格 | role は DB から毎回取得。Token の role は無視 |
| 退会済みユーザーのアクセス | Membership 再検証。Refresh 時にも再検証 |
| 停止テナントへのアクセス | tenants.status を `/authorize` と API 両方で確認 |

### ログインエンドポイント

| 脅威 | 対策 |
| --- | --- |
| パスワードスプレー / ブルートフォース | IP とユーザー名でレート制限。Cognito 側のロックアウトも併用 |
| ユーザー列挙 | 失敗理由を統一メッセージにする。応答時間を揃える |
| 資格情報の平文送信 | USER_SRP_AUTH。USER_PASSWORD_AUTH を無効化 |
| Clickjacking | `X-Frame-Options: DENY` と `frame-ancestors 'none'` |

## HTTP セキュリティヘッダ

auth.sandbox.com と tenant-*.sandbox.com に共通で付与する。

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store   (認証関連レスポンス)
```

tenant-*.sandbox.com は `form-action 'self'` を追加してよい。フォームの送信先も送信後のリダイレクト先も自ホストに閉じるため。

auth.sandbox.com には `form-action` を付けない。Chrome はフォーム送信後のリダイレクト先にも `form-action` を適用するため、ログイン POST から各 Client の redirect_uri への 302 がブロックされる。redirect_uri は Client 登録で動的に増えるため列挙できない。ログインフォームの CSRF は同期トークンで防ぐ。

`/token` `/userinfo` `/revoke` の応答には `Cache-Control: no-store` と `Pragma: no-cache` を付ける。

## ログとシークレット

- ログは構造化し、出力するフィールドを許可リストで定義する
- Token、Cookie 値、code、client_secret、パスワードは秘密値型で扱い、シリアライザで自動的に `[REDACTED]` にする
- 認証イベントは user_id / client_id / tenant_id / 結果 / 理由コード / IP / User-Agent を記録する
- Cognito API の例外メッセージをそのままユーザーへ返さない

## シークレット管理

| シークレット | 保管 | ローテーション |
| --- | --- | --- |
| Auth Server 署名鍵 | Secret Store | JWKS 併存方式。04参照 |
| Cognito App Client Secret | Secret Store | Cognito 側で再生成後に差し替え |
| client_secret | Secret Store。DB はハッシュ | Client ごと。新旧 2 世代を受け付ける猶予期間を設ける |
| Cognito Token 暗号化鍵 | Secret Store | 鍵 ID をレコードに保存し、旧鍵で復号できるようにする |
| Session Store 接続情報 | Secret Store | |

## レート制限

| エンドポイント | 制限 |
| --- | --- |
| POST /login | IP あたり 10 回/分。ユーザー名あたり 5 回/分 |
| POST /token | client_id あたり 60 回/分 |
| GET /authorize | IP あたり 60 回/分 |
| POST /auth/callback 相当 | Tenant 側で IP あたり 30 回/分 |

## 依存関係と運用

- JWT ライブラリは jose 等の標準準拠実装を使い、自前実装しない
- 暗号乱数は `crypto.randomBytes` / `crypto.getRandomValues` のみ
- 依存パッケージの脆弱性スキャンを CI に組み込む
- 認証イベントのメトリクスを監視する。401 / 403 の急増、Refresh 再利用検知、code 再利用検知
