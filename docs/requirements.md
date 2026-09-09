# Sandbox 認証・マルチテナントSSO基盤 仕様書

## 1. 目的

SandboxはマルチテナントSaaSとして提供する。各テナントは専用サブドメインからサービスを利用する。

```text
tenant-a.sandbox.com
tenant-b.sandbox.com
tenant-c.sandbox.com
```

認証基盤はテナントWebアプリケーションおよび業務APIから分離する。

```text
Cognito
    ↓
auth.sandbox.com
    ↓
tenant-a.sandbox.com
tenant-b.sandbox.com
tenant-c.sandbox.com

tenant Web Application
    ↓
api.sandbox.com
```

ユーザーが一度Sandboxにログインすると、別テナントへ移動した際にも再ログインを要求しないSSOを実現する。将来的にSandbox配下のサービスだけでなく、異なるドメインのサービスを追加した場合にもSSOを利用できる拡張可能なアーキテクチャを目指す。

## 2. 絶対条件

### 2.1 Cognito Hosted UI / Managed Loginを使用しない

Hosted UIへのリダイレクトによってログインする方式は採用しない。ログイン画面および認証フローはSandbox側で制御する。Cognitoはユーザー認証基盤として利用する。

### 2.2 Cookie共有によるSSOを使用しない

`Domain=.sandbox.com` として全サービスでCookieを共有する方式を禁止する。テナント間で認証Cookieを直接共有しない。SSOは独立した認証サーバーで実現する。

### 2.3 Cognito Tokenをサービス間で直接渡さない

Cognito Access Token / ID Token / Refresh Token をURLパラメータ等で別サービスへ渡してはいけない。

## 3. システム構成

```text
                         ┌─────────────────────┐
                         │      Amazon         │
                         │      Cognito        │
                         │     User Pool       │
                         │ User Authentication │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  auth.sandbox.com   │
                         │ Authentication      │
                         │ SSO                 │
                         │ Authorization       │
                         │ Tenant Context      │
                         └──────────┬──────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  ▼                 ▼                 ▼
          tenant-a.sandbox.com tenant-b.sandbox.com tenant-c.sandbox.com
                  │                 │                 │
                  └─────────────────┼─────────────────┘
                                    ▼
                            api.sandbox.com
                                    ▼
                                Database
```

## 4. 各システムの責務

### 4.1 Amazon Cognito

ユーザー認証、ユーザー識別、パスワード認証、MFA等の認証機能、Cognitoユーザー情報管理、必要なToken発行。CognitoはSandboxのテナント認可そのものを担当しない。

### 4.2 Authentication / SSO Server。auth.sandbox.com

ログイン、Cognitoとの認証連携、SSOセッション管理、OAuth 2.0 / OpenID Connectベースの認証連携、Authorization Code発行、Client管理、redirect_uri管理、ユーザー識別、テナントへのアクセス可否確認、必要なユーザー情報 / Claimsの提供、ログアウト、将来的なGlobal Logoutへの対応。各テナントWebアプリケーションおよびAPI Serverから独立させる。

### 4.3 Tenant Web Application。tenant-*.sandbox.com

UI、現在のログイン状態の管理、自サービスセッションの管理、auth.sandbox.comとの認証連携、api.sandbox.comへのAPIアクセス。Tenant Web Application自身がCognitoに直接ログインする構成にはしない。

### 4.4 API Server。api.sandbox.com

業務API、データ取得、データ更新、テナントデータへのアクセス、APIレベルの認証、APIレベルの認可、Tenant Isolation。API ServerとAuthentication Serverは独立した責務として扱う。

## 5. 認証とSSOの責務分離

```text
Cognito              → ユーザー本人であることの認証
auth.sandbox.com     → Sandbox全体のSSO
tenant-a.sandbox.com → Tenant Aにおけるアプリケーションセッション
tenant-b.sandbox.com → Tenant Bにおけるアプリケーションセッション
api.sandbox.com      → API認証・認可およびデータアクセス
```

これらを一つのCookieやTokenにまとめない。

## 6. 初回ログインフロー

未ログインで tenant-a.sandbox.com へアクセスすると、Authorization Request で auth.sandbox.com へ遷移し、SSO Sessionがなければ自前ログイン画面でCognito APIによる認証を行う。認証成功後にSSO Sessionを作成し、Authorization Codeを発行してTenant Aへ戻す。Tenant AはCodeを検証しTenant A用Sessionを作成する。

## 7. 別テナントへのSSO

Tenant Aにログイン済みのユーザーが tenant-b.sandbox.com へアクセスすると、Tenant B側にセッションがないためauth.sandbox.comへ遷移する。SSO Sessionがあるため Cognito再認証は不要でAuthorization Codeを発行し、Tenant B Sessionが作成される。ユーザーにはTenant Bでログイン画面を表示しない。

## 8. 独立ドメインへの拡張

sandbox.com と another-service.com のように異なるドメインであっても、Auth Serverを共通のSSO Providerとして利用できる構造にする。SSOの成立条件をCookie Domainに依存させない。

## 9. SSO Session

SSO Sessionは auth.sandbox.com でのみ管理する。

```text
Domain=auth.sandbox.com
Path=/
Secure
HttpOnly
SameSite=Lax
```

このCookieをTenant Web Application間で共有しない。

## 10. Tenant Application Session

各Tenant Web Applicationは独自のセッションを持つ。Tenant AとTenant BのCookieを共有しない。SSO完了後にそれぞれのアプリケーションが自身のセッションを作成する。

## 11. OAuth 2.0 / OpenID Connect

Auth Serverは可能な限り標準的なOAuth 2.0 / OpenID Connectに準拠する。各Tenant Web ApplicationはOAuth/OIDC Clientとして扱う。redirect_uriは厳格に管理し、ワイルドカードは原則として許可しない。

## 12. Authorization Code

短い有効期限、一回のみ使用可能、使用済みCodeは無効化、Client IDと紐付け、redirect_uriと紐付け、必要な認証コンテキストと紐付け。Authorization Codeに認証情報そのものを直接格納しない。

## 13. State / Nonce

stateを利用し、OIDCではnonceも利用する。state / nonce / client_id / redirect_uri を適切に検証し、CSRF、認証レスポンス差し替え、Open Redirect等を防止する。

## 14. User Identity

Cognito User Pool上のユーザー識別子をSandboxにおけるユーザーの正規識別子として利用する。ユーザーとTenantは別概念として扱い、1ユーザーが複数Tenantに所属できる設計を可能とする。

## 15. Tenantモデル

```text
users          id, cognito_sub, ...
tenants        id, slug, ...
tenant_members tenant_id, user_id, role, ...
```

サブドメインからTenantを特定する。URL上のTenant ID / slugをそのまま認可情報として信頼してはいけない。必ずサーバー側で Authenticated User → Tenant Membership → Role / Permission → Authorization を検証する。

## 16. Tenant Isolation

Tenant間のデータ分離を保証する。API Serverではリクエストに含まれるTenant IDだけを信用して認可してはいけない。IDOR、BOLA、Tenant IDの改ざん、他Tenantのデータ取得・更新・削除を防止する。

## 17. API認証

Request → Authentication → User Identity → Tenant Membership → Role / Permission → Authorization → Data Access の順序で処理する。

## 18. Token設計

Cognito TokenとSandbox内部の認証情報を明確に分離する。Cognito Tokenを別Tenantや別サービスへ直接渡さない。URLへのToken埋め込みも禁止する。

## 19. Logout

### 19.1 Tenant Logout

Tenant Aからログアウトした場合 tenant-a_session のみを削除する。SSO Sessionは原則として維持する。

### 19.2 Global Logout

将来的に auth.sandbox.com/logout によるGlobal Logoutを実装可能な構造にする。SSO Session、各Tenant Session、Refresh Token等を無効化できる設計を検討する。

## 20. セキュリティ要件

HTTPS、Secure Cookie、HttpOnly Cookie、適切なSameSite設定、Authorization Codeの短命化と一回限り利用、redirect_uriの厳格な検証、stateによるCSRF対策、nonce検証、Open Redirect対策、Session Fixation対策、ログイン成功時のSession IDローテーション、Token / Cookieのログ出力禁止、Cognito Refresh Tokenのサービス間共有禁止、Cognito TokenのURL埋め込み禁止、Tenant IDだけを根拠にした認可禁止、Tenant Membershipによる認可、BOLA / IDOR対策。

## 21. システム境界

Cognito → auth.sandbox.com → tenant-*.sandbox.com → api.sandbox.com の責務境界を維持する。認証サーバーを通常の業務APIやTenant Applicationに組み込まない。

## 22. 実装前の調査

1. Cognito User Pool構成
2. Cognito認証方式
3. 現在のログイン処理
4. Access Token / ID Token / Refresh Tokenの利用箇所
5. 現在のCookie設計
6. Session Store
7. Userのデータモデル
8. Tenantのデータモデル
9. User / Tenant Membershipの構造
10. Tenant Web Applicationの構成
11. API Serverの構成
12. Auth Serverの配置方法
13. DB構成
14. CORS設定
15. CSRF対策
16. 現在の認可処理

## 23. 実装前に作成する成果物

1. システム構成図
2. 初回ログインシーケンス図
3. 別TenantへのSSOシーケンス図
4. Authorization Code Flow
5. Logoutシーケンス図
6. Cookie設計
7. Token設計
8. User / Tenant / Membership DB設計
9. API認証設計
10. API認可設計
11. Tenant Isolation設計
12. セキュリティ設計
13. エラーケース一覧
14. テスト計画

## 24. Claudeへの実装指示

実装を開始する前に既存コード・DB・インフラ・認証処理を調査すること。いきなりコードを書き始めない。まず以下を提示すること。

1. 現状分析
2. 現在の認証フロー
3. 現在の問題点
4. 推奨アーキテクチャ
5. システム構成図
6. 認証シーケンス図
7. DB変更案
8. API変更案
9. セッション設計
10. Token設計
11. Tenant認可設計
12. セキュリティ上の問題
13. 移行計画

## 25. 設計上の重要な方針

既存コードを最小限変更すること自体を目的にしない。Tenant数・Tenant Application・別ドメインのサービス・管理画面・APIが増えることを前提として設計する。認証基盤と業務システムの責務境界を優先する。

## 26. 技術仕様に関する判断

OAuth 2.0 / OpenID Connect / Amazon Cognitoの仕様に準拠できる部分は独自仕様を作らず標準仕様を優先する。Cognito Hosted UI / Managed Loginを使用しないことは変更不可の要件とする。

## 27. 不明点への対応

設計上の不明点や仕様上の矛盾を発見した場合は推測して実装を進めない。問題点、なぜ問題なのか、考えられる選択肢、各選択肢のメリット・デメリット、推奨案、推奨理由を明示する。根拠のない設計判断を行わない。

## 28. 最終的な目標

ユーザーは一度認証すれば、権限を持つ複数のTenantへ移動しても再ログインを要求されない。各Tenant Applicationは独立したセッションを持ち、Tenant間でCookieを共有しない。認証基盤、Tenant Application、API Server、データベースの責務を明確に分離し、将来的なサービス追加に耐えられる認証アーキテクチャとする。
