# Logout設計

## 結論

Logout は Tenant Logout と Global Logout の2種類に分離する。
Tenant Logout は自テナントの Session と Refresh Token のみを失効させ、SSO Session を維持する。
Global Logout は OIDC Back-Channel Logout で実現し、初期実装では `sid` の発行と保存までを行う。

## 失効対象の対応表

| 操作 | Tenant Session | Tenant の Refresh Token | SSO Session | 他 Tenant の Session | Cognito Refresh Token |
| --- | --- | --- | --- | --- | --- |
| Tenant Logout | 削除 | 失効 | 維持 | 維持 | 維持 |
| Global Logout | 削除。Back-Channel 経由 | 全系列失効 | 削除 | 削除。Back-Channel 経由 | RevokeToken |
| SSO Session 期限切れ | 維持。Refresh で失効 | Refresh 時に失効 | 削除 | 同左 | 破棄 |
| Membership 削除 | 維持。Refresh で失効 | Refresh 時に失効 | 維持 | 維持 | 維持 |
| ユーザー無効化 | 維持。Refresh で失効 | Refresh 時に失効 | 次回 /authorize で削除 | 同左 | 管理操作で Revoke |

## Tenant Logout

シーケンスは [02-auth-sequences.md](./02-auth-sequences.md) の10。

| 項目 | 内容 |
| --- | --- |
| エンドポイント | `POST /auth/logout`。GET は受け付けない |
| CSRF | 同期トークン必須 |
| 処理 | Refresh Token を `/revoke` で失効 → Tenant Session 削除 → Cookie 削除 → `/` へ 302 |
| 冪等性 | セッションがなくても 302 |
| SSO Session | 維持する。仕様書19.1 |

### 再ログイン時の挙動

SSO Session が残っているため、Logout 直後に `/auth/login` を踏むとパスワード入力なしで再ログインされる。仕様どおりの挙動だが、ユーザーには「Sandbox 全体からログアウトする」導線として Global Logout へのリンクをログアウト完了画面に置く。

### /revoke エンドポイント

RFC 7009 に従う。

```text
POST /revoke
Authorization: Basic client_id:client_secret
token=<refresh_token>&token_type_hint=refresh_token
```

- 該当 Refresh Token とその系列を失効
- 存在しない token でも 200 を返す
- Access Token の失効は行わない。15分の寿命で自然失効させる

## Global Logout。フェーズ2

シーケンスは [02-auth-sequences.md](./02-auth-sequences.md) の11。

| 項目 | 内容 |
| --- | --- |
| エンドポイント | `POST /logout` on auth.sandbox.com。確認画面付き |
| CSRF | 同期トークン必須 |
| 処理 | sid 系列の Refresh Token 全失効 → Cognito RevokeToken → SSO Session 削除 → Back-Channel Logout 送信 → Cookie 削除 |
| 通知先 | SSO Session の authorized_clients に含まれる Client のうち backchannel_logout_uri を持つもの |
| 通知失敗 | 完了扱い。対象 Tenant は Refresh 失敗で最大15分以内に失効 |

### logout_token

OIDC Back-Channel Logout 1.0 に従う。

```json
{
  "iss": "https://auth.sandbox.com",
  "aud": "tenant-a",
  "iat": 1700000000,
  "exp": 1700000120,
  "jti": "…",
  "sid": "b2a7…",
  "events": { "http://schemas.openid.net/event/backchannel-logout": {} }
}
```

Tenant 側の検証。

1. 署名 / iss / aud / iat / exp
2. `events` に backchannel-logout が含まれる
3. `nonce` が含まれていないこと
4. jti の重複を短時間記憶してリプレイを拒否
5. sid に紐付く Tenant Session を逆引きインデックスからすべて削除

### 初期実装で用意しておくもの

- ID Token と Access Token に `sid` を含める
- Tenant Session に `sid` を保存し、`sid → session_id[]` の逆引きを持つ
- SSO Session に `authorized_clients` を保存する
- oidc_clients に `backchannel_logout_uri` 列を持つ

これにより Global Logout は Auth Server の `/logout` と Tenant の `/auth/backchannel-logout` を追加するだけで有効化できる。

## RP-Initiated Logout を採用しない理由

OIDC RP-Initiated Logout は Tenant から Auth Server の `/logout` へリダイレクトして SSO Session を終了させる方式である。仕様書19.1 は Tenant Logout で SSO Session を維持することを求めているため、既定の Tenant Logout には採用しない。ユーザーが明示的に Global Logout を選んだ場合の導線としては使用してよい。

## Cognito 側のセッション

Cognito の Refresh Token は Auth Server の SSO Session に閉じている。Global Logout では `RevokeToken` で失効させる。Cognito 管理者による `AdminUserGlobalSignOut` が実行された場合、Auth Server の SSO Session は独立して残るため、管理操作として Auth Server 側の SSO Session 失効 API も用意する。フェーズ2。
