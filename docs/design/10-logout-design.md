# Logout設計

## 結論

Logout は Tenant Logout と Global Logout の2種類に分離する。
Tenant Logout は自ホストのテナント × サービスの Session と Refresh Token のみを失効させ、SSO Session を維持する。
Global Logout は auth.sandbox.com の `/logout` と OIDC Back-Channel Logout で実現する。Back-Channel Logout はサービス単位で送り、サービスは sid で自サービスの全テナントの Session を削除する。ログイン中の画面のヘッダとポータルから Global Logout へ誘導する。
本人はポータルの `/security` で自分の他の端末のセッションを失効できる。手順は Global Logout と同じで、対象の sid だけに行う。招待の解除は割り当てを消すだけで終わらせず、そのサービスとテナントの Refresh Token 系列を即時に失効させ、そのサービスへ Back-Channel Logout を送る。SSO Session と他のサービスは残す。判断事項D21。

## 失効対象の対応表

| 操作 | 自ホストの Tenant Session | その Refresh Token | SSO Session | 他ホストの Session。他テナント / 他サービス | Cognito Refresh Token |
| --- | --- | --- | --- | --- | --- |
| Tenant Logout | 削除 | 失効 | 維持 | 維持 | 維持 |
| Global Logout | 削除。Back-Channel 経由 | 全系列失効 | 削除 | 削除。Back-Channel 経由 | RevokeToken |
| ポータルからのセッション失効 | 対象の sid について Global Logout と同じ | 同左 | 対象の sid だけ削除。操作した端末は残る | 対象の sid だけ Back-Channel 経由で削除 | 対象の sid の Token を RevokeToken |
| SSO Session 期限切れ | 維持。Refresh で失効 | Refresh 時に失効 | 削除 | 同左 | 破棄 |
| サービスへの割り当て削除 | 削除。そのサービスへの Back-Channel 経由 | 解除されたサービスとテナントの系列を即時失効 | 維持 | 他サービスは維持。同サービスの他テナントの Tenant Session は Back-Channel で消えるが、系列と割り当てが残るため再アクセスで無画面復帰する | 維持 |
| 契約解除 | 維持。Refresh で失効 | Refresh 時に失効 | 維持 | 維持。同テナントの他サービスは影響なし | 維持 |
| ユーザー無効化 | 維持。Refresh で失効 | Refresh 時に失効 | 次回 /authorize で access_denied | 同左 | 管理操作で Revoke |

どの失効も `auth_sessions` の記録と `audit_events` に残す。Global Logout は `global_logout`、それ以外の SSO Session の失効は `session_revoked` で、理由は `global_logout` `user_revoked` `service_member_revoked` `refresh_token_reused` `expired` のいずれか。

## Tenant Logout

シーケンスは [02-auth-sequences.md](./02-auth-sequences.md) の10。

| 項目 | 内容 |
| --- | --- |
| エンドポイント | `POST /auth/logout`。GET は受け付けない |
| CSRF | 同期トークン必須 |
| 処理 | Refresh Token を `/revoke` で失効 → Tenant Session 削除 → Cookie 削除 → `/?logged_out=1` へ 302。SPA はこのクエリがあるときだけ再ログインへ送らず、ログアウト済み画面を出す |
| 冪等性 | セッションがなくても 302 |
| SSO Session | 維持する。仕様書19.1 |
| 範囲 | Host のテナント × サービスのみ。tanaka.crm でログアウトしても suzuki.crm と tanaka.cms は残る |

### 再ログイン時の挙動

SSO Session が残っているため、Logout 直後に `/auth/login` を踏むとパスワード入力なしで再ログインされる。仕様どおりの挙動だが、ユーザーには「全体からログアウト」の導線として Global Logout へのリンクをログイン中の画面のヘッダに置く。リンクは `/session` の `urls.globalLogout` で渡し、`https://auth.sandbox.com/logout?client_id=crm&tenant=tanaka` のように、戻り先を復元するためのサービスとテナントを付ける。ログアウト済み画面には「もう一度ログインする」のリンクを置く。

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
| エンドポイント | `GET /logout?client_id=crm&tenant=tanaka` は auth-web の SPA。SPA が `GET /api/logout?client_id=&tenant=` を読み、SSO Session があれば `authenticated: true` と `csrfToken` と `returnTo` を受けて確認画面を描く。確認フォームは csrf、client_id、tenant を hidden で持ち、HTML フォームの POST で `POST /logout` に送る。POST は完了後に `/logout?client_id=&tenant=` へ 303 し、SPA が `/api/logout` の `authenticated: false` で完了画面を描く |
| CSRF | 同期トークン必須。`/api/logout` が Cookie とトークンを発行する |
| 処理 | sid 系列の Refresh Token 全失効 → Cognito RevokeToken → SSO Session 削除 → Back-Channel Logout 送信 → `auth_sessions` を revoked に更新して `global_logout` を監査 → Cookie 削除 → `/logout` へ 303。`revokeSsoSession` にまとめ、ポータルからの失効も同じ関数を使う |
| 通知先 | `sso:clients` の集合に含まれるサービスのうち、`oidc_clients.status` が `active` で backchannel_logout_uri を持つもの。サービスごとに1通。停止した Client には送らない |
| タイムアウト | `fetch` に `AbortSignal.timeout(5000)` を付ける。`BACKCHANNEL_TIMEOUT_MS`。1 サービスの無応答が完了画面を止めない |
| 通知失敗 | 完了扱い。対象サービスの Session は Refresh 失敗で最大15分以内に失効 |
| 完了画面 | SPA が「Sandbox からログアウトしました」を出す。`/api/logout` の `returnTo` は `{label: "CRM (tanaka)", href: "https://tanaka.crm.sandbox.com/"}` で、`client_id` の `redirect_uri_template` を `tenant` で展開した URL の origin から導く。SPA は「CRM (tanaka) に戻る」のリンクを出す。`returnTo` がなければリンクを出さない |
| レート制限 | `/logout` と `/api/logout` は同じ IP あたり 60 回/分 |

サービスへの通知はテナントを区別しない。alice が tanaka.crm と suzuki.crm にログインしていても crm には1通だけ送り、crm 側が sid で両方のセッションを削除する。

### 戻り先リンクの導出

```text
client_id = crm, tenant = tanaka
template  = https://{tenant}.crm.sandbox.com/auth/callback
展開      = https://tanaka.crm.sandbox.com/auth/callback
リンク    = https://tanaka.crm.sandbox.com/   (展開結果の origin)
```

`tenant` はクエリで受け取った文字列をそのまま使わず、`tenants` を slug で引いた行の slug で展開する。展開元がサービスの登録テンプレートなので、リンク先はサービスのホスト以外になり得ない。`client_id` が未登録か `tenant` が tenants にない場合は `/api/logout` の `returnTo` を返さず、SPA は戻り先のリンクを出さない。ポータルの各サービスへのリンクも同じ展開で導き、`/api/portal` の `loginUrl` として返す。

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
現在の実装は `sub` に sid を入れ、`typ` を `logout+jwt` ではなく `JWT` にしている。変更は未対応。[08-security-design.md](./08-security-design.md) の未対応を参照。

Tenant Web Application 側の検証。

1. 署名 / iss / iat / exp
2. `aud` が自サービスの `CLIENT_ID` と一致すること。不一致なら 400
3. `events` に backchannel-logout が含まれる
4. `nonce` が含まれていないこと
5. ストア `<clientId>:sid` のキー `sid:<sid>` の集合から、テナントを問わずそのサービスの Tenant Session をすべて削除し、集合も削除する

jti の重複記憶によるリプレイ拒否は未対応。リプレイされても冪等な削除が繰り返されるだけで、新しい状態は作れない。受け口は IP あたり 60 回/分のレート制限と 16 KB の body 上限を通す。

### 前提となる構造

- ID Token と Access Token に `sid` を含める
- Tenant Session に `sid` を保存し、ストア `<clientId>:sid` に `sid:<sid> → sessionKey の集合` の逆引きを `SetStore` で持つ。Tenant Logout の `destroySession` は集合から自分のキーを外す
- SSO Session ID から code を発行したサービスの client_id を引ける集合 `sso:clients` を持つ。値の配列ではなく `SetStore` にし、並行する `/authorize` で追加が落ちないようにする
- oidc_clients に `backchannel_logout_uri` 列を持つ
- oidc_clients に `redirect_uri_template` 列を持ち、完了画面とポータルの戻り先を展開で導く

## ポータルからのセッション失効

シーケンスは [02-auth-sequences.md](./02-auth-sequences.md) の13。

| 項目 | 内容 |
| --- | --- |
| 画面 | auth-web の `/security`。ポータルの「セキュリティ」から入る。`GET /api/sessions` で本人の active なセッションの一覧と CSRF を受け取り、セッションごとに IP、User-Agent、ログイン時刻、最終アクセス、入ったサービスとテナントをカードで出す。現在のセッションには「この端末」の印を付け、失効のボタンを出さない |
| 一覧の出どころ | Identity DB の `auth_sessions` と `auth_session_clients`。サービス名とテナント名は identity から引く。status が active の行だけを出す。揮発ストアの期限切れは記録に反映されないため、期限切れのセッションも失効するまでは一覧に残る |
| エンドポイント | `POST /sessions/revoke`。フォーム POST で `csrf` と `session_id` を受け取り、完了後に `/security` へ 303 |
| CSRF | 同期トークン必須。`/api/sessions` が Cookie とトークンを発行する。不一致は 403 のサーバー HTML |
| 対象 | 自分の sid だけ。他人の sid、自分の現在のセッション、存在しない sid は無視して `/security` へ 303 する |
| 処理 | `revokeSessionBySid` が sid から SSO Session を引き、Global Logout と同じ手順で失効させる。理由は `user_revoked`。揮発ストアに既に無ければ `auth_sessions` の記録だけを revoked にする |
| レート制限 | `/api/sessions` と `/sessions/*` は `/logout` と同じ IP あたり 60 回/分 |
| 未認証 | `GET /api/sessions` は 401 `unauthenticated` で SPA が `/login` へ遷移する。`POST /sessions/revoke` は `/login` へ 303 |

## 招待解除の即時失効

シーケンスは [02-auth-sequences.md](./02-auth-sequences.md) の14。

| 項目 | 内容 |
| --- | --- |
| 起点 | サービスの `DELETE /v1/members/:userId` が auth-api の `DELETE /admin/service-members` を呼ぶ。auth-api は割り当てを消したあと `revokeClientAccess` を実行する |
| 対象の絞り込み | その人の active な `auth_sessions` のうち、`auth_session_clients` に解除されたサービスとテナントの組があるもの |
| 部分失効 | 対象セッションの Refresh Token 系列のうち、`describeRefreshTokenFamily` で読んだ clientId と tenantId が解除されたサービスとテナントに一致する系列だけを失効させる。他のサービスとテナントの系列、SSO Session、Cognito の Refresh Token は残す |
| Back-Channel Logout | 対象セッションごとに、解除されたサービスにだけ logout_token を送る。Back-Channel Logout はサービス単位のため、そのサービスの他テナントの Tenant Session も消えるが、割り当てと系列が残っていれば SSO で無画面復帰する |
| 監査 | `service_member_revoked` に user_id、tenant_id、client_id と、失効させた sid の一覧を残す。招待は `service_member_invited` |
| Access Token | 発行済みの Access Token は寿命の 15 分まで有効。Tenant Session が消えるため BFF はその Token を使わない |
| 結果 | 解除されたサービスの Refresh は `invalid_grant`、同じ人の他のサービスの Refresh は通る |

## RP-Initiated Logout を採用しない理由

OIDC RP-Initiated Logout は Tenant から Auth Server の `/logout` へリダイレクトして SSO Session を終了させる方式である。仕様書19.1 は Tenant Logout で SSO Session を維持することを求めているため、既定の Tenant Logout には採用しない。ユーザーが明示的に Global Logout を選んだ場合の導線としては使用してよい。

## Cognito 側のセッション

Cognito の Refresh Token は Auth Server の SSO Session に閉じている。Global Logout とポータルからの失効では `RevokeToken` で失効させる。Cognito 管理者による `AdminUserGlobalSignOut` が実行された場合、Auth Server の SSO Session は独立して残る。sid を指定して失効させる `revokeSessionBySid` はあるが、管理者向けの HTTP API は用意していない。管理用 API はフェーズ2。
