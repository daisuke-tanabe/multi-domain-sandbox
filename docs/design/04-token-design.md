# Token設計

## 結論

Tokenは3系統に分離し、系統間で値を流用しない。

```text
[Cognito Token]        Cognito ⇄ Auth Server 内部のみ。暗号化保存
[Auth発行 Token]       Auth Server → Tenant Web App (Back Channel) → API Server (Bearer)
[Code / state]         Front Channel を通ってよい唯一の値
```

ブラウザはどの Token も保持しない。

## Token一覧

| Token | 発行者 | 受け取り手 | 経路 | 寿命 | 保存場所 |
| --- | --- | --- | --- | --- | --- |
| Cognito Access / ID / Refresh Token | Cognito | Auth Server | Back Channel | Cognito設定 | SSO Session Store。AES-256-GCMで暗号化 |
| Authorization Code | Auth Server | Tenant Web App | Front Channel | 60秒。一回限り | Auth Code Store |
| ID Token | Auth Server | Tenant Web App | Back Channel | 5分 | 検証後に必要claimsのみ Tenant Session へ |
| Access Token | Auth Server | Tenant Web App → API Server | Back Channel / Bearer | 15分 | Tenant Session Store |
| Refresh Token | Auth Server | Tenant Web App | Back Channel | 12時間。ローテーション | Refresh Token Store と Tenant Session Store |
| logout_token | Auth Server | Tenant Web App | Back Channel | 2分 | 保存しない。サービスごとに1通 |

## ID Token

Tenant Web App がユーザーを識別するための Token。API へは送らない。

```json
{
  "iss": "https://auth.sandbox.com",
  "sub": "8f1c…",
  "aud": "crm",
  "exp": 1700000300,
  "iat": 1700000000,
  "auth_time": 1699999000,
  "nonce": "N1",
  "sid": "b2a7…",
  "tenant_id": "01J00000000000000000TANAKA0",
  "tenant_slug": "tanaka",
  "email": "user@example.com",
  "email_verified": true,
  "name": "表示名"
}
```

| claim | 内容 |
| --- | --- |
| `sub` | Sandbox内部の user_id。Cognito subそのものではなく users.id を返す。判断事項D3の設計に従い、Cognito固有値をClientへ露出しない |
| `aud` | client_id。サービスごとのClient。`crm` または `cms` |
| `nonce` | pre-auth の nonce と一致を検証 |
| `sid` | SSO Session を表す公開識別子。Back-Channel Logout用。SSO Session ID とは別値 |
| `tenant_id` | redirect_uri をテンプレートに当てて解決したテナントID。表示と整合性確認用。認可根拠には使わない。常に載る |
| `tenant_slug` | 同テナントの slug。Tenant Web App が Host から得たテナントと一致することを検証する。常に載る |
| `auth_time` | Cognito で実際に認証した時刻。SSO で code を発行した時刻ではない |
| `email` `name` | scope に応じて提供。最小限 |

`cognito:groups` や `cognito:username` などCognito固有claimは載せない。すべての認可はテナントに紐付くため、`tenant_id` と `tenant_slug` を持たない ID Token は発行しない。

### Tenant Web App 側の検証

1. 署名。`/jwks` の公開鍵、kid で選択。alg は RS256 のみ許可
2. `iss` 一致
3. `aud` が自分の client_id
4. `exp` 未来
5. `nonce` 一致
6. `iat` が許容スキュー内
7. `tenant_slug` が Host から解決したテナントと一致

## Access Token

API Server 向けの Token。JWT 形式で自己完結検証できるようにする。

```json
{
  "iss": "https://auth.sandbox.com",
  "sub": "8f1c…",
  "aud": ["https://api.crm.sandbox.com", "https://auth.sandbox.com"],
  "client_id": "crm",
  "tenant_id": "01J00000000000000000TANAKA0",
  "sid": "b2a7…",
  "scope": "openid profile email",
  "exp": 1700000900,
  "iat": 1700000000,
  "jti": "…"
}
```

| claim | 内容 |
| --- | --- |
| `aud` | サービスの API origin と issuer の配列。API origin は oidc_clients.audience。issuer を含めるのは `/userinfo` で同じ Token を受け付けるため。Tenant Web App 宛ての ID Token と取り違えない |
| `client_id` | 発行先のサービス |
| `tenant_id` | この Token が有効なテナント。1 Token = 1 テナント。常に載る |
| `sid` | Global Logout 時の失効判定に使える識別子 |
| `jti` | 失効リストを導入する場合のキー。初期は未使用 |

role や permission は載せない。role は API Server が自サービス DB の members を毎回参照して解決し、permission は役割の既定に permission_overrides の上書きを重ねて確定する。判断事項D16、D17。理由は次のとおり。

- 権限変更を次のリクエストから反映する。Token に載せると寿命の 15 分間は古い権限で通る
- Auth Server がサービスごとの役割と権限の語彙を知らなくてよい。Auth Server が扱うのは client_id と割り当てだけで、role と permission の名前は各サービスが自分の DB で決める
- Token がサービス数と権限数に比例して肥大化しない

Token 発行後のサービスへの割り当て削除は Refresh 時に Auth Server が拒否し、Access Token 寿命の 15 分以内に反映される。`client_id` は API Server がこのサービスの Token であることを確かめる claim で、`tenant_id` と `sub` が自サービス DB の members を引くキーになる。

aud はサービスごとに異なる。CRM 向けに発行した Token を api.cms.sandbox.com に出しても aud 不一致で拒否される。

### API Server 側の検証

1. 環境変数 `API_BASE_URL` を受け付ける aud とする。リクエストの Host が `API_BASE_URL` のホストと異なれば 404
2. 署名。Auth JWKS。RS256 のみ
3. `iss` 一致
4. `aud` に 1 で導いた値が含まれる
5. `exp` 未来
6. `tenant_id` `client_id` `sub` でこのサービスへの割り当てを Identity DB で再検証し、権限の上書きを自サービスの DB から読む
7. 以降は [07-api-auth-design.md](./07-api-auth-design.md)

## Refresh Token

| 項目 | 値 |
| --- | --- |
| 形式 | 256bitランダム。不透明文字列 |
| 寿命 | 12時間。SSO Session の絶対期限と同じ |
| ローテーション | 使用ごとに新しい値を発行。旧値は失効。消費は GETDEL で先に行い、直後に rotated として書き戻してから検証に進む |
| 再利用検知 | rotated / revoked の値が使われたら同系列全体を失効。別 Client からの提示も同様 |
| 同時提示 | 同じ値を同時に 2 回提示しても成功は 1 つ。もう一方は invalid_grant で、系列は失効しない |
| 紐付け | user_id / tenant_id / sid / client_id / family_id |
| 失効条件 | SSO Session 失効、ユーザー無効化、テナント停止、契約解除、サービスへの割り当て削除、Tenant Logout、Global Logout |

refresh_token grant では `/authorize` と同じ順序でアクセス判定を再実行する。user → tenant → 契約 → サービスへの割り当て。

Cognito Refresh Token とは無関係。Cognito Refresh Token は Auth Server が Cognito 側のセッション延長にのみ使う。

## Authorization Code

| 項目 | 値 |
| --- | --- |
| 形式 | 256bitランダム。不透明文字列 |
| 寿命 | 60秒 |
| 使用回数 | 1回。使用済み化をアトミックに行う |
| 再利用検知 | invalid_grant。同 code から発行した Refresh Token を失効 |
| 紐付け | client_id / redirect_uri / scope / nonce / code_challenge / user_id / tenant_id / sid / auth_time |

code は JWT にしない。認証情報はサーバー側ストアに置き、code は参照キーに徹する。

## PKCE

Confidential Client でも PKCE を必須にする。

- code_verifier。43文字以上128文字以下のランダム文字列。Tenant Web App が生成し pre-auth に保存
- code_challenge。`BASE64URL(SHA256(code_verifier))`。method は S256 のみ受け付ける
- `/token` で検証。code 横取りに対する防御層を追加する

## 署名鍵

| 項目 | 方針 |
| --- | --- |
| アルゴリズム | RS256。将来 ES256 へ移行可能にする |
| 鍵管理 | 秘密鍵は Auth Server のみ保持。Secret Store から起動時に読み込む |
| kid | 鍵ごとに付与。JWKS で複数鍵を公開 |
| ローテーション | 新鍵を JWKS に追加 → 新鍵で署名開始 → Token 最大寿命経過後に旧鍵を削除 |
| クライアント側 | kid 単位でキャッシュ。未知の kid は再取得 |

## Cognito Token の取り扱い

- 保存前にアプリケーション層で暗号化。鍵は Secret Store
- ログに出さない
- ブラウザへ送らない。Cookie にも載せない
- Cognito Access Token は Auth Server が Cognito API を呼ぶ場合にのみ使う。初期実装では GetUser 等の利用予定はない
- SSO Session 破棄時に Cognito Refresh Token を破棄する。Global Logout 時は RevokeToken を呼ぶ

## 禁止事項

- Cognito Token を Tenant Web App や API Server へ渡すこと
- JWT を URL クエリ / フラグメントに載せること
- ID Token を API 認証に使うこと
- Access Token をブラウザへ渡すこと
- テナント間での Token 流用。tenant_id と tenant_slug で拒否する
- サービス間での Token 流用。aud で拒否する
- 独自暗号化 Token 方式の導入
