# Logout設計

## 結論

Logout は Tenant Logout と Global Logout の2種類に分離する。
Tenant Logout は自ホストのテナント × サービスの Session と Refresh Token のみを失効させ、SSO Session を維持する。
Global Logout は auth.sandbox.com の `/logout` と OIDC Back-Channel Logout で実現する。Back-Channel Logout はサービス単位で送り、サービスは sid で自サービスの全テナントの Session を削除する。Tenant Logout 後の画面から Global Logout へ誘導する。

## 失効対象の対応表

| 操作 | 自ホストの Tenant Session | その Refresh Token | SSO Session | 他ホストの Session。他テナント / 他サービス | Cognito Refresh Token |
| --- | --- | --- | --- | --- | --- |
| Tenant Logout | 削除 | 失効 | 維持 | 維持 | 維持 |
| Global Logout | 削除。Back-Channel 経由 | 全系列失効 | 削除 | 削除。Back-Channel 経由 | RevokeToken |
| SSO Session 期限切れ | 維持。Refresh で失効 | Refresh 時に失効 | 削除 | 同左 | 破棄 |
| Membership 削除 | 維持。Refresh で失効 | Refresh 時に失効 | 維持 | 維持 | 維持 |
| 契約解除 | 維持。Refresh で失効 | Refresh 時に失効 | 維持 | 維持。同テナントの他サービスは影響なし | 維持 |
| ユーザー無効化 | 維持。Refresh で失効 | Refresh 時に失効 | 次回 /authorize で access_denied | 同左 | 管理操作で Revoke |

## Tenant Logout

シーケンスは [02-auth-sequences.md](./02-auth-sequences.md) の10。

| 項目 | 内容 |
| --- | --- |
| エンドポイント | `POST /auth/logout`。GET は受け付けない |
| CSRF | 同期トークン必須 |
| 処理 | Refresh Token を `/revoke` で失効 → Tenant Session 削除 → Cookie 削除 → `/` へ 302 |
| 冪等性 | セッションがなくても 302 |
| SSO Session | 維持する。仕様書19.1 |
| 範囲 | Host のテナント × サービスのみ。tanaka.crm でログアウトしても suzuki.crm と tanaka.cms は残る |

### 再ログイン時の挙動

SSO Session が残っているため、Logout 直後に `/auth/login` を踏むとパスワード入力なしで再ログインされる。仕様どおりの挙動だが、ユーザーには「Sandbox 全体からログアウトする」導線として Global Logout へのリンクをログアウト完了画面に置く。リンクは `https://auth.sandbox.com/logout?client_id=crm&tenant=tanaka` のように、戻り先を復元するためのサービスとテナントを付ける。

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

## Global Logout

シーケンスは [02-auth-sequences.md](./02-auth-sequences.md) の11。

| 項目 | 内容 |
| --- | --- |
| エンドポイント | `GET /logout?client_id=crm&tenant=tanaka` で確認画面。`POST /logout` に csrf、client_id、tenant を送る |
| CSRF | 同期トークン必須 |
| 処理 | sid 系列の Refresh Token 全失効 → Cognito RevokeToken → SSO Session 削除 → Back-Channel Logout 送信 → Cookie 削除 |
| 通知先 | SSO Session の authorized_clients に含まれるサービスのうち backchannel_logout_uri を持つもの。サービスごとに1通 |
| 通知失敗 | 完了扱い。対象サービスの Session は Refresh 失敗で最大15分以内に失効 |
| 完了画面 | `client_id` と `tenant` に対応する登録 redirect_uri の origin へ「CRM (tanaka) に戻る」のリンク。加えて `/` ポータルへのリンク |

サービスへの通知はテナントを区別しない。alice が tanaka.crm と suzuki.crm にログインしていても crm には1通だけ送り、crm 側が sid で両方のセッションを削除する。

### logout_token

OIDC Back-Channel Logout 1.0 に従う。

```json
{
  "iss": "https://auth.sandbox.com",
  "aud": "crm",
  "iat": 1700000000,
  "exp": 1700000120,
  "jti": "…",
  "sid": "b2a7…",
  "events": { "http://schemas.openid.net/event/backchannel-logout": {} }
}
```

送信先は `oidc_clients.backchannel_logout_uri`。CRM は `https://crm.sandbox.com/auth/backchannel-logout`、CMS は `https://cms.sandbox.com/auth/backchannel-logout`。テナントのホストではなくサービスのベースホストで受ける。

Tenant Web Application 側の検証。

1. 署名 / iss / iat / exp
2. `aud` が自サービスの `CLIENT_ID` と一致すること。不一致なら 400
3. `events` に backchannel-logout が含まれる
4. `nonce` が含まれていないこと
5. jti の重複を短時間記憶してリプレイを拒否
6. `<clientId>:sid:<sid>` の逆引きから、テナントを問わずそのサービスの Tenant Session をすべて削除

### 前提となる構造

- ID Token と Access Token に `sid` を含める
- Tenant Session に `sid` を保存し、`<clientId>:sid:<sid> → sessionKey[]` の逆引きを持つ
- SSO Session に `authorized_clients` としてサービスの client_id を保存する
- oidc_clients に `backchannel_logout_uri` 列を持つ

## RP-Initiated Logout を採用しない理由

OIDC RP-Initiated Logout は Tenant から Auth Server の `/logout` へリダイレクトして SSO Session を終了させる方式である。仕様書19.1 は Tenant Logout で SSO Session を維持することを求めているため、既定の Tenant Logout には採用しない。ユーザーが明示的に Global Logout を選んだ場合の導線としては使用してよい。

## Cognito 側のセッション

Cognito の Refresh Token は Auth Server の SSO Session に閉じている。Global Logout では `RevokeToken` で失効させる。Cognito 管理者による `AdminUserGlobalSignOut` が実行された場合、Auth Server の SSO Session は独立して残るため、管理操作として Auth Server 側の SSO Session 失効 API も用意する。管理用 API はフェーズ2。
