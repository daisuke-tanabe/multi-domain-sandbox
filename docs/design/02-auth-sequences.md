# 認証シーケンス図

## 結論

全フローは OIDC Authorization Code Flow + PKCE に準拠する。
Front Channel を通るのは code と state のみ。Cognito Token、ID Token、Access Token、Refresh Token はすべて Back Channel かサーバー内部に閉じる。
テナントへのアクセス可否は `/authorize` と refresh_token grant で user → tenant → 契約 → サービスへの割り当て の順に判定する。API Server は Identity DB を見ず、役割と権限を自サービスの DB から毎リクエスト読む。Token には役割も権限も載せない。
招待はサービスの画面から行い、サービスの API が Auth Server の管理 API で「入れる」を登録してから自 DB に役割付きの member 行を作る。Identity DB にいない人はメールで事前作成し、初回ログイン時に Cognito の sub を紐付ける。

登場人物。

| 表記 | 実体 |
| --- | --- |
| Browser | ユーザーのブラウザ |
| TanakaCrm | tanaka.crm.sandbox.com。CRM の Tenant Web Application。BFF |
| SuzukiCrm | suzuki.crm.sandbox.com。CRM の別テナント |
| TanakaCms | tanaka.cms.sandbox.com。CMS の Tenant Web Application |
| SuzukiCms | suzuki.cms.sandbox.com。契約がないテナント × サービス |
| Auth | auth.sandbox.com。Auth Server |
| Cognito | Amazon Cognito User Pool |
| IdDB | Identity DB。users / tenants / tenant_members / oidc_clients / oidc_client_secrets / tenant_services / tenant_service_members |
| SsoStore | SSO Session Store、Auth Code Store、Refresh Token Store |
| Sess | Tenant Session Store。サービスごとに `<clientId>:sess` のプレフィックスで作り、キーは `<tenantSlug>:<sessionId>`。図中の `crm:tanaka:T1` や `crm:sid:<sid>` はプレフィックスとキーを続けて書いた略記 |
| ApiCrm | api.crm.sandbox.com |
| CrmDB | CRM DB。members / permission_overrides / end_users。crm-api だけが接続する |

ユーザーは alice。identity では tanaka の crm と cms、suzuki の crm に入れる。CRM DB の members では tanaka で owner、suzuki で viewer。suzuki では `end_users:unmask` を allow されている。CMS DB の members では tanaka で owner で、`posts:create` を deny されている。

## 1. 初回ログイン。tanaka.crm.sandbox.com へ未ログイン状態でアクセス

SSO Session も Tenant Session もない状態からの完全なフロー。仕様書23章の成果物2。

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant TanakaCrm as TanakaCrm (tanaka.crm.sandbox.com)
    participant Auth as Auth (auth.sandbox.com)
    participant Cognito
    participant IdDB
    participant SsoStore
    participant Sess

    Browser->>TanakaCrm: GET /
    TanakaCrm-->>Browser: 200 SPA の index.html
    Browser->>TanakaCrm: GET /session
    Note over TanakaCrm: tenant_session Cookieなし → 未ログイン<br/>Host から service=crm, tenantSlug=tanaka を解決
    TanakaCrm-->>Browser: 200 {authenticated:false, urls:{login:"/auth/login", ...}}
    Note over Browser: SPA の clientLoader が /auth/login?return_to=/ へ遷移
    Browser->>TanakaCrm: GET /auth/login?return_to=/
    TanakaCrm->>TanakaCrm: state, nonce, code_verifier を生成<br/>code_challenge = BASE64URL(SHA256(code_verifier))
    TanakaCrm->>Sess: pre-auth保存<br/>{state, nonce, code_verifier, return_to:"/"} TTL 30分
    TanakaCrm-->>Browser: 302 https://auth.sandbox.com/authorize<br/>?response_type=code&client_id=crm<br/>&redirect_uri=https://tanaka.crm.sandbox.com/auth/callback<br/>&scope=openid profile email<br/>&state=S1&nonce=N1<br/>&code_challenge=C1&code_challenge_method=S256<br/>Set-Cookie: tenant_pre_auth=P1#59; HttpOnly#59; Secure#59; SameSite=Lax#59; Path=/auth

    Browser->>Auth: GET /authorize?...
    Note over Auth: sso_session Cookieなし
    Auth->>IdDB: oidc_clients から client_id=crm を取得
    Auth->>Auth: redirect_uri を crm の redirect_uri_template に当てて slug=tanaka を取り出す<br/>前後の完全一致と slug 形式を検証
    Auth->>IdDB: tenants を slug=tanaka で検索 → tenant_id
    Auth->>Auth: response_type=code / scope / PKCE必須 を検証
    Auth->>SsoStore: 認可リクエスト保存<br/>{rid, client_id, redirect_uri, tenant_id, scope, state, nonce, code_challenge} TTL 30分
    Auth-->>Browser: 302 /login?rid=R1

    Browser->>Auth: GET /login?rid=R1
    Auth-->>Browser: 200 auth-web の SPA の index.html
    Browser->>Auth: GET /api/login?rid=R1
    Auth->>SsoStore: R1 の存在確認
    Auth-->>Browser: 200 {rid, csrfToken}<br/>Set-Cookie: auth_csrf。Cache-Control: no-store
    Note over Browser: SPA が「Sandbox にログイン」のフォームを描く<br/>rid と csrf は hidden
    Browser->>Auth: POST /login {username, password, csrf, rid}。HTML フォームの POST
    Auth->>Auth: CSRFトークン検証、rid の存在確認
    Auth->>Cognito: InitiateAuth AuthFlow=USER_SRP_AUTH<br/>SECRET_HASH付き。SRPハンドシェイク
    Cognito-->>Auth: AuthenticationResult<br/>{AccessToken, IdToken, RefreshToken}
    Auth->>Auth: Cognito IdToken 検証<br/>署名(Cognito JWKS) / iss / aud / exp / token_use
    Auth->>IdDB: users を cognito_sub で検索<br/>なければ同じメールで cognito_sub が NULL の行に sub を紐付け<br/>それもなければ JIT作成
    Auth->>SsoStore: SSO Session作成<br/>{sso_session_id, sid, user_id,<br/>cognito_tokens(暗号化), auth_time}
    Auth->>SsoStore: Cookie が指す旧 SSO Session があれば破棄<br/>sso:sess / sso:sid / sso:clients
    Note over Auth: Cognito Tokenはここから外に出さない
    Auth->>IdDB: アクセス判定。users.status → tenants.status<br/>→ tenant_services (tanaka, crm) → tenant_service_members (tanaka, crm, user_id)
    alt 判定失敗
        Auth-->>Browser: 302 https://tanaka.crm.sandbox.com/auth/callback<br/>?error=access_denied&error_description=no_membership&state=S1<br/>Set-Cookie: sso_session=X1
        Note over Browser,TanakaCrm: TanakaCrm が理由に応じた 403 画面を表示。SSO Session は残る。以降は省略
    end
    Auth->>SsoStore: Authorization Code発行<br/>{code, client_id:crm, redirect_uri, scope, nonce,<br/>code_challenge, user_id, tenant_id, sid, auth_time} TTL 60秒
    Auth->>SsoStore: sso:clients の集合に crm を追加
    Auth-->>Browser: 303 https://tanaka.crm.sandbox.com/auth/callback?code=AC1&state=S1<br/>Set-Cookie: sso_session=X1#59; HttpOnly#59; Secure#59; SameSite=Lax#59; Path=/<br/>Domain属性なし。auth.sandbox.comのみに限定

    Browser->>TanakaCrm: GET /auth/callback?code=AC1&state=S1<br/>Cookie: tenant_pre_auth=P1
    TanakaCrm->>Sess: pre-auth P1 を取得
    TanakaCrm->>TanakaCrm: state == S1 を検証
    TanakaCrm->>Auth: POST /token (Back Channel)<br/>Authorization: Basic base64(crm:client_secret)<br/>grant_type=authorization_code&code=AC1<br/>&redirect_uri=https://tanaka.crm.sandbox.com/auth/callback<br/>&code_verifier=V1
    Auth->>IdDB: client認証。oidc_client_secrets の active な行のいずれかとハッシュ照合
    Auth->>SsoStore: code AC1 を取得し used=true に更新。アトミック
    Auth->>Auth: 未使用 / 期限内 / client_id一致 / redirect_uri一致<br/>BASE64URL(SHA256(V1)) == code_challenge
    Auth->>SsoStore: Refresh Token発行。{rt, user_id, tenant_id, sid, client_id:crm}
    Auth-->>TanakaCrm: 200 {id_token, access_token, refresh_token,<br/>token_type:Bearer, expires_in:900}
    Note over Auth,TanakaCrm: id_token / access_token は Auth が署名したJWT。Cognito Tokenではない

    TanakaCrm->>TanakaCrm: id_token検証<br/>署名(Auth JWKS) / iss / aud=crm / exp / nonce==N1<br/>tenant_slug == tanaka (Host 由来)
    TanakaCrm->>Sess: Tenant Session作成。キー crm:tanaka:T1<br/>{user_id=sub, tenant_id, tenant_slug, sid, access_token, refresh_token, expires_at}
    TanakaCrm->>Sess: sid 逆引き crm:sid:<sid> に T1 を追加
    TanakaCrm->>Sess: pre-auth P1 削除
    TanakaCrm-->>Browser: 302 /<br/>Set-Cookie: tenant_session=T1#59; HttpOnly#59; Secure#59; SameSite=Lax#59; Path=/<br/>Set-Cookie: tenant_pre_auth=#59; Max-Age=0
    Browser->>TanakaCrm: GET / → 200 index.html
    Browser->>TanakaCrm: GET /session (tenant_session=T1)
    TanakaCrm-->>Browser: 200 {authenticated:true, user, csrfToken}。Token は含まない
    Browser->>TanakaCrm: GET /api/v1/me (tenant_session=T1)
    TanakaCrm-->>Browser: 200 {role: owner, permissions, service.roles, service.permissions}
    Note over Browser: SPA がホームに role と権限の表を描く
```

要点。

- code は60秒、一回限り。使用済み化を先に行ってから検証結果を返す
- users の解決は cognito_sub → 同じメールで cognito_sub が NULL の行 → JIT 作成の順。2 番目は招待で事前作成された人で、ここで sub が紐付く。同じメールが別の sub に既に紐付いていればログインを拒否し、既存行を書き換えない
- 認可リクエストのテナントは client_id と redirect_uri の組から Auth Server が解決する。redirect_uri をサービスの redirect_uri_template に当てて slug を取り出し、tenants を引く。Tenant Web Application はテナントを申告しない
- アクセス判定は Cognito 認証成功後、code 発行前に行う。契約がないサービス、そのテナントのそのサービスに割り当てのないユーザーには code を発行しない
- 認証は成功しているため SSO Session は作成する。アクセスできるテナントへ移動すればログイン画面なしで入れる
- ブラウザに渡るのは Cookie のみ。access_token / refresh_token は TanakaCrm のサーバー側セッションに保存する。SPA は `/session` でログイン状態と CSRF トークンだけを受け取り、API は `/api/*` 経由で呼ぶ
- ログイン成功時に Cookie が指す旧 SSO Session があれば破棄する。Cookie の上書きだけでは旧セッションが期限まで残る
- ログイン画面は auth-web の SPA が描く。SPA は `/api/login` で rid と CSRF を受け取ってフォームを描くだけで、資格情報は HTML フォームの POST で `/login` へ送る。パスワードを fetch で送らない。判断事項D19

## 2. 別テナント・別サービスへのSSO

tanaka.crm でログイン済みの状態。パスワード入力もログイン画面も出ない。仕様書23章の成果物3。

### 2.1 別テナント。suzuki.crm.sandbox.com へ初回アクセス

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant SuzukiCrm as SuzukiCrm (suzuki.crm.sandbox.com)
    participant Auth as Auth (auth.sandbox.com)
    participant IdDB
    participant SsoStore
    participant Sess

    Browser->>SuzukiCrm: GET / → 200 index.html → GET /session → {authenticated:false}
    Note over SuzukiCrm: tenant_session Cookieなし<br/>tanaka.crm の Cookie は suzuki.crm には届かない
    Browser->>SuzukiCrm: GET /auth/login?return_to=/
    SuzukiCrm->>Sess: pre-auth保存 {state:S2, nonce:N2, code_verifier:V2, return_to}
    SuzukiCrm-->>Browser: 302 https://auth.sandbox.com/authorize<br/>?client_id=crm&redirect_uri=https://suzuki.crm.sandbox.com/auth/callback<br/>&state=S2&nonce=N2&code_challenge=C2&code_challenge_method=S256&...

    Browser->>Auth: GET /authorize?...<br/>Cookie: sso_session=X1 (auth.sandbox.com宛てなので自動送信)
    Auth->>SsoStore: sso_session X1 を検証。アイドル / 絶対期限内
    Note over Auth: SSO Session有効 → Cognito再認証もログインUIも不要
    Auth->>IdDB: client_id=crm の取得。redirect_uri をテンプレートに当てて slug=suzuki → tenants から解決
    Auth->>IdDB: アクセス判定。users → tenants → tenant_services (suzuki, crm) → tenant_service_members (suzuki, crm, user_id)
    alt 判定失敗
        Auth-->>Browser: 302 https://suzuki.crm.sandbox.com/auth/callback?error=access_denied&error_description=<理由>&state=S2
    end
    Auth->>SsoStore: lastSeenAt更新。sso:clients は {crm} のまま
    Auth->>SsoStore: Authorization Code発行 {code:AC2, client_id:crm, tenant_id:suzuki, sid, ...} TTL 60秒
    Auth-->>Browser: 302 https://suzuki.crm.sandbox.com/auth/callback?code=AC2&state=S2

    Browser->>SuzukiCrm: GET /auth/callback?code=AC2&state=S2
    SuzukiCrm->>SuzukiCrm: state == S2 を検証
    SuzukiCrm->>Auth: POST /token (Back Channel) code=AC2, code_verifier=V2, client認証 crm
    Auth->>SsoStore: code 使用済み化と検証
    Auth-->>SuzukiCrm: 200 {id_token, access_token, refresh_token, ...}
    SuzukiCrm->>SuzukiCrm: id_token検証。aud=crm, nonce==N2, tenant_slug==suzuki
    SuzukiCrm->>Sess: Tenant Session作成 crm:suzuki:T2
    SuzukiCrm-->>Browser: 302 /<br/>Set-Cookie: tenant_session=T2
    Browser->>SuzukiCrm: GET / → GET /session → GET /api/v1/me
    SuzukiCrm-->>Browser: 200 {role: viewer, permissions}。SPA がホームを描く
```

同一ユーザーが tanaka の crm では owner、suzuki の crm では viewer というように、テナント × サービスごとに異なる role を持てる。role は CRM DB の members から crm-api が解決し、Access Token には載せない。Auth Server は「入れるか」だけを見る。

### 2.2 別サービス。tanaka.cms.sandbox.com へ初回アクセス

client_id が `cms` になる点と、Access Token の aud が api.cms になる点以外は 2.1 と同じ。

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant TanakaCms as TanakaCms (tanaka.cms.sandbox.com)
    participant Auth as Auth (auth.sandbox.com)
    participant IdDB
    participant SsoStore

    Browser->>TanakaCms: GET /
    Note over TanakaCms: tenant_session Cookieなし。tanaka.crm とは別ホスト
    TanakaCms-->>Browser: 302 https://auth.sandbox.com/authorize<br/>?client_id=cms&redirect_uri=https://tanaka.cms.sandbox.com/auth/callback&...
    Browser->>Auth: GET /authorize?... Cookie: sso_session=X1
    Auth->>IdDB: client_id=cms の取得。redirect_uri をテンプレートに当てて slug=tanaka → tenants から解決
    Auth->>IdDB: アクセス判定。tenant_services (tanaka, cms) あり。tenant_service_members (tanaka, cms, user_id) あり
    Auth->>SsoStore: sso:clients に cms を追加。code 発行 {client_id:cms, tenant_id:tanaka, sid}
    Auth-->>Browser: 302 https://tanaka.cms.sandbox.com/auth/callback?code=AC3&state=S3
    Browser->>TanakaCms: GET /auth/callback?code=AC3&state=S3
    TanakaCms->>Auth: POST /token client認証 cms:client_secret
    Auth-->>TanakaCms: 200 {id_token(aud=cms), access_token(aud=api.cms), refresh_token}
    TanakaCms->>TanakaCms: id_token検証。aud=cms, tenant_slug==tanaka
    TanakaCms-->>Browser: 302 /<br/>Set-Cookie: tenant_session=T3
```

### 2.3 契約のないサービス。suzuki.cms.sandbox.com へアクセス

redirect_uri は cms のテンプレートに一致し suzuki も tenants にあるが、suzuki は cms を契約していない。

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant SuzukiCms as SuzukiCms (suzuki.cms.sandbox.com)
    participant Auth as Auth (auth.sandbox.com)
    participant IdDB
    participant SsoStore

    Browser->>SuzukiCms: GET /
    SuzukiCms-->>Browser: 302 /authorize?client_id=cms&redirect_uri=https://suzuki.cms.sandbox.com/auth/callback&state=S4...
    Browser->>Auth: GET /authorize?... Cookie: sso_session=X1
    Auth->>IdDB: redirect_uri をテンプレートに当てて slug=suzuki → tenants にあるので 400 にはしない
    Auth->>IdDB: アクセス判定。tenant_services (suzuki, cms) なし
    Auth->>SsoStore: lastSeenAt更新。SSO Session は維持
    Auth-->>Browser: 302 https://suzuki.cms.sandbox.com/auth/callback<br/>?error=access_denied&error_description=not_contracted&state=S4
    Browser->>SuzukiCms: GET /auth/callback?error=access_denied&error_description=not_contracted&state=S4
    SuzukiCms->>SuzukiCms: pre-auth の state と一致を検証
    SuzukiCms-->>Browser: 403 「テナント suzuki は CMS を契約していません」
    Note over Browser: sso_session と tanaka.crm / suzuki.crm / tanaka.cms のセッションは残る
```

結果。

```text
tanaka.crm.sandbox.com → ログイン済み (tenant_session。キー crm:tanaka:T1)
suzuki.crm.sandbox.com → ログイン済み (tenant_session。キー crm:suzuki:T2)
tanaka.cms.sandbox.com → ログイン済み (tenant_session。キー cms:tanaka:T3)
suzuki.cms.sandbox.com → 403 not_contracted。セッションなし
auth.sandbox.com       → SSO Session 1つ。sso:clients = {crm, cms}
```

## 3. Authorization Code Flow の詳細

`/authorize` と `/token` の内部処理を成果物4として切り出す。

### 3.1 /authorize の判定フロー

```mermaid
flowchart TD
    A["GET /authorize"] --> B{"client_id が<br/>oidc_clients に存在?"}
    B -- no --> E1["400 エラー画面<br/>リダイレクトしない"]
    B -- yes --> C{"redirect_uri が<br/>redirect_uri_template に一致?<br/>前後完全一致 + 中間が slug 形式"}
    C -- no --> E1
    C -- yes --> C1{"slug が tenants に存在?"}
    C1 -- no --> E1
    C1 -- yes --> C2["そのテナントを<br/>認可リクエストのテナントとする"]
    C2 --> D{"response_type=code<br/>scope に openid<br/>code_challenge_method=S256?"}
    D -- no --> E2["302 redirect_uri<br/>?error=invalid_request&state"]
    D -- yes --> F{"sso_session Cookie<br/>が有効?"}
    F -- no --> G["認可リクエストを保存<br/>302 /login?rid"]
    G --> H["Cognito認証成功後<br/>SSO Session作成"]
    F -- yes --> I["lastSeenAt 更新"]
    H --> J1{"users.status<br/>= active?"}
    I --> J1
    J1 -- no --> E3["302 redirect_uri<br/>?error=access_denied<br/>&error_description=user_disabled&state"]
    J1 -- yes --> J2{"tenants.status<br/>= active?"}
    J2 -- no --> E4["302 ... error_description=tenant_suspended"]
    J2 -- yes --> J3{"tenant_services に<br/>(tenant_id, client_id)<br/>が active で存在?"}
    J3 -- no --> E5["302 ... error_description=not_contracted"]
    J3 -- yes --> J4{"tenant_service_members に<br/>(tenant_id, client_id, user_id)<br/>が存在?"}
    J4 -- no --> E6["302 ... error_description=no_membership"]
    J4 -- "存在するが status!=active" --> E7["302 ... error_description=membership_inactive"]
    J4 -- active --> K["code 発行 TTL 60秒<br/>sso:clients の集合に client_id を追加"]
    K --> L["302 redirect_uri?code&state"]
```

テンプレートに一致しない redirect_uri と、一致しても slug が tenants にない redirect_uri はどちらも `invalid_redirect_uri` で、E1 のとおりリダイレクトしない。テナントに紐付かない戻り先は存在せず、すべての認可はテナントに紐付く。user → tenant → 契約 → サービスへの割り当て の判定は、user・契約・割り当てを並列に取得したうえでこの順に評価する。割り当てはこのサービスのものだけを見るため、別サービスの割り当てでは通らない。

### 3.2 /token の判定フロー。grant_type=authorization_code

```mermaid
flowchart TD
    A["POST /token"] --> B{"client_secret_basic<br/>で client 認証成功?<br/>active な secret のいずれかに一致"}
    B -- no --> E1["401 invalid_client"]
    B -- yes --> C["code をストアから取得し<br/>アトミックに used=true へ"]
    C --> D{"code が存在し<br/>更新前 used=false?"}
    D -- "存在しない/期限切れ" --> E2["400 invalid_grant"]
    D -- "既に used=true" --> R["同codeで発行済みの<br/>refresh_token を失効"] --> E2
    D -- yes --> F{"code.client_id ==<br/>認証済み client_id?"}
    F -- no --> E2
    F -- yes --> G{"code.redirect_uri ==<br/>リクエストの redirect_uri?"}
    G -- no --> E2
    G -- yes --> H{"BASE64URL(SHA256(code_verifier))<br/>== code.code_challenge?"}
    H -- no --> E2
    H -- yes --> I["id_token 生成<br/>sub, aud=client_id, nonce, sid, auth_time,<br/>tenant_id, tenant_slug"]
    I --> J["access_token 生成<br/>aud=[client.audience, issuer]<br/>sub, tenant_id, sid, client_id, scope"]
    J --> K["refresh_token 発行し保存"]
    K --> L["200 JSON"]
```

client.audience は oidc_clients に登録したサービスの API origin。crm なら `https://api.crm.sandbox.com`。

### 3.3 /token の判定フロー。grant_type=refresh_token

```mermaid
sequenceDiagram
    autonumber
    participant TanakaCrm as TanakaCrm (tanaka.crm.sandbox.com)
    participant Auth as Auth (auth.sandbox.com)
    participant SsoStore
    participant IdDB

    Note over TanakaCrm: API呼び出し前に access_token の exp を確認<br/>残り60秒未満なら更新
    TanakaCrm->>TanakaCrm: セッション単位のロックを setIfAbsent で取得<br/>取れなければ保持者の完了を待って再読込
    TanakaCrm->>Auth: POST /token<br/>grant_type=refresh_token&refresh_token=RT1<br/>client認証 crm
    Auth->>SsoStore: RT1 を GETDEL で取り出し、直後に rotated として書き戻す
    alt RT1 が存在しない / 期限切れ / 同時提示のもう一方
        Auth-->>TanakaCrm: 400 invalid_grant。系列は失効しない
        Note over TanakaCrm: Tenant Session を破棄し /auth/login へ。SSO Sessionが生きていれば無画面で復帰
    end
    alt RT1 が rotated / revoked。再利用
        Auth->>SsoStore: 系列の全 Refresh Token を revoked に更新
        Auth-->>TanakaCrm: 400 invalid_grant
    end
    alt RT1.client_id が認証済み Client と不一致
        Auth->>SsoStore: 系列の全 Refresh Token を revoked に更新
        Auth-->>TanakaCrm: 400 invalid_grant。client_mismatch
    end
    Auth->>SsoStore: 紐付くSSO Sessionが有効か確認
    alt SSO Session失効済み
        Auth->>SsoStore: 系列失効
        Auth-->>TanakaCrm: 400 invalid_grant
    end
    Auth->>IdDB: アクセス判定を再実行<br/>users → tenants → tenant_services → tenant_service_members
    alt 判定失敗。契約解除 / 割り当て削除 / 停止
        Auth->>SsoStore: 系列失効
        Auth-->>TanakaCrm: 400 invalid_grant
    end
    Auth->>SsoStore: 同じ系列で RT2 を発行。sso:rtfamily に追加
    Auth-->>TanakaCrm: 200 {access_token(新), refresh_token:RT2, expires_in:900}
    TanakaCrm->>TanakaCrm: Tenant Session の token を更新し、ロックを解放
```

消費を先に行う。同じ RT1 を同時に 2 回提示されても GETDEL で取り出せるのは 1 回だけで、もう一方は存在しない値として `invalid_grant` になる。このとき系列は失効させない。正規の Client の偶発的な二重送信で全セッションを落とさないためで、系列を失効させるのは `rotated` / `revoked` の値が提示された再利用と、別 Client からの提示に限る。
Tenant 側は同じセッションで Refresh を 1 回にまとめる。`ensureFreshAccessToken` がセッション単位のロックを取り、取れなかったリクエストは 100 ミリ秒間隔で最大 30 回セッションを読み直して、Refresh 済みの Token で続行する。

## 4. API呼び出し。BFFからapi.crm.sandbox.comへ

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant TanakaCrm as TanakaCrm (tanaka.crm.sandbox.com)
    participant Sess
    participant ApiCrm as ApiCrm (api.crm.sandbox.com)
    participant CrmDB

    Browser->>TanakaCrm: GET /api/v1/end-users (tenant_session=T1)
    Note over TanakaCrm: セッションがなければ 401 {error: unauthenticated}<br/>書き込みなら X-CSRF-Token を照合し、不一致は 403
    TanakaCrm->>Sess: セッション crm:tanaka:T1 取得。access_token を取り出す
    TanakaCrm->>ApiCrm: GET /v1/end-users<br/>Host: api.crm.sandbox.com<br/>Authorization: Bearer <access_token>
    ApiCrm->>ApiCrm: Host が aud=https://api.crm.sandbox.com のホストと一致するか確認<br/>違えば 404
    ApiCrm->>ApiCrm: JWT検証<br/>署名(Auth JWKS, kid) / iss / aud / exp
    ApiCrm->>ApiCrm: claims から sub(user_id), tenant_id, tenant_slug, client_id を取得
    ApiCrm->>CrmDB: members (tenant_id, sub) を読む。app.tenant_id を設定<br/>行がなければ既定の役割 viewer で作る
    alt member.status が active でない
        ApiCrm-->>TanakaCrm: 403 {error: forbidden}
    end
    ApiCrm->>CrmDB: permission_overrides (tenant_id, sub) を読む
    ApiCrm->>ApiCrm: role の既定 ∪ allow − deny で権限を確定。end_users:read を確認<br/>end_users:unmask の有無でマスクを決める
    ApiCrm->>CrmDB: SELECT ... FROM crm.end_users WHERE tenant_id = :tenant_id
    Note over ApiCrm,CrmDB: tenant_id は Token由来のみ。リクエストパラメータのtenant_idは使わない<br/>トランザクションごとに set_config('app.tenant_id') で RLS を併用
    CrmDB-->>ApiCrm: rows
    ApiCrm-->>TanakaCrm: 200 JSON。unmask がなければ email と phone をマスク
    TanakaCrm-->>Browser: 200 JSON をそのまま返す。SPA が一覧を描く
```

ブラウザは API Server と直接通信しない。BFF の `/api/*` が同一オリジンで中継するため CORS設定は不要になる。API がセッション切れを返したら BFF は 401 にし、SPA が `/auth/login` へ遷移して再ログインする。CRM の Access Token を api.cms.sandbox.com に出すと aud 不一致で 401 になる。
役割も権限も Token には載っていない。API Server は Identity DB を見ず、役割と権限の上書きを自サービスの DB から毎回読む。「入れるか」は Auth Server が Token 発行時と Refresh 時に判定済みで、割り当てを外された人は Refresh で `invalid_grant` になり最大 15 分で API を呼べなくなる。alice が tanaka.cms で `POST /v1/posts` を呼ぶと、owner の既定に cms 側の `posts:create` の deny が重なり 403 になる。

## 4.1 招待と初回ログインでの紐付け

tanaka の crm の owner である alice が、Identity DB にいない dave を招待する。

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Browser (alice)
    participant TanakaCrm as TanakaCrm (tanaka.crm.sandbox.com)
    participant ApiCrm as ApiCrm (api.crm.sandbox.com)
    participant CrmDB
    participant Auth as Auth (auth.sandbox.com)
    participant IdDB
    actor Invitee as Browser (dave)
    participant Cognito

    Admin->>TanakaCrm: 招待フォーム送信 {email: dave@example.com, role: member}
    TanakaCrm->>ApiCrm: POST /v1/members<br/>Authorization: Bearer <alice の access_token><br/>{email, name?, role: member}
    ApiCrm->>ApiCrm: members:invite を確認。role が CRM の語彙にあるか検証
    ApiCrm->>Auth: POST /admin/service-members (Back Channel)<br/>Authorization: Basic base64(crm:client_secret)<br/>{tenant_id, email, name}
    Auth->>IdDB: oidc_client_secrets で Client 認証 → client=crm
    Auth->>IdDB: tenants を tenant_id で検索<br/>tenant_services (tenant_id, crm) が active か
    alt 契約なし
        Auth-->>ApiCrm: 403 {error: not_contracted}
        ApiCrm-->>TanakaCrm: 403 {error: not_contracted}
    end
    Auth->>IdDB: users を email で検索<br/>なければ {id: ULID, cognito_sub: NULL, email, name} で作成
    Auth->>IdDB: tenant_service_members (tenant_id, crm, user_id) を upsert。status=active
    Auth-->>ApiCrm: 201 {user: {id, email, name, linked: false}}
    ApiCrm->>CrmDB: members (tenant_id, user_id, email, name, role: member) を upsert
    ApiCrm-->>TanakaCrm: 201 {member: {user_id, email, name, role, status}, linked: false}
    TanakaCrm-->>Admin: 200 一覧に dave が並ぶ

    Note over Invitee,Cognito: 後日、dave が tanaka.crm を開く。Cognito には dave が存在する
    Invitee->>Auth: POST /login {username: dave, password}
    Auth->>Cognito: InitiateAuth
    Cognito-->>Auth: AuthenticationResult {sub: cognito-sub-dave, email: dave@example.com}
    Auth->>IdDB: users を cognito_sub で検索 → なし
    Auth->>IdDB: users を email で検索 → cognito_sub が NULL の行あり
    Auth->>IdDB: その行に cognito_sub を紐付ける
    Auth->>IdDB: アクセス判定。tenant_service_members (tanaka, crm, dave) あり
    Auth-->>Invitee: 302 /auth/callback?code&state
    Note over Invitee,ApiCrm: 以降は 1. と同じ。crm-api は members に dave の行があるため role=member で権限を確定する
```

要点。

- 「入れるか」は Auth Server、役割はサービスの DB。招待は両方に書き、順序は Auth Server が先。Auth Server が拒否すればサービスの DB には何も残らない
- Auth Server は Client 自身のサービスへの割り当てだけを操作させる。crm の secret で cms への割り当ては作れない
- 招待時に user_id が確定するため、サービスは初回ログイン前から役割と上書きを持てる
- `GET /admin/service-members` と `GET /v1/members` の `linked` で初回ログイン済みかが分かる
- 削除は逆で、`DELETE /v1/members/:userId` が Auth Server の割り当てを消してから自 DB の行を消す。Auth Server 側に割り当てがなくても自 DB の行は消す。自分自身は消せない

## 5. ログイン済みテナントへの再訪

Tenant Session が有効な間は Auth Server との通信は発生しない。

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant TanakaCrm as TanakaCrm (tanaka.crm.sandbox.com)
    participant Sess

    Browser->>TanakaCrm: GET / → 200 index.html
    Browser->>TanakaCrm: GET /session (tenant_session=T1)
    TanakaCrm->>Sess: crm:tanaka:T1 を検証。lastSeenAt 更新
    TanakaCrm-->>Browser: 200 {authenticated:true, ...}
```

## 6. Tenant Session期限切れ。SSO Sessionは有効

「2. 別テナント・別サービスへのSSO」と同じフローで無画面復帰する。

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant TanakaCrm as TanakaCrm (tanaka.crm.sandbox.com)
    participant Auth as Auth (auth.sandbox.com)

    Browser->>TanakaCrm: GET /session または GET /api/... (tenant_session=期限切れ)
    TanakaCrm-->>Browser: /session は {authenticated:false}、/api/* は 401
    Note over Browser: SPA が /auth/login?return_to=<現在のパス> へ遷移
    Browser->>TanakaCrm: GET /auth/login?return_to=/end-users
    TanakaCrm-->>Browser: 302 /authorize へ
    Browser->>Auth: GET /authorize (sso_session有効)
    Auth-->>Browser: 302 /auth/callback?code&state
    Browser->>TanakaCrm: GET /auth/callback
    TanakaCrm->>Auth: POST /token
    Auth-->>TanakaCrm: tokens
    TanakaCrm-->>Browser: 302 /end-users<br/>Set-Cookie: tenant_session=新規ID
```

## 7. SSO Session期限切れ

`/authorize` が SSO Session を無効と判定してログイン画面へ誘導する。以降は「1. 初回ログイン」と同一。すべての Tenant Session はそれぞれの期限まで有効なまま残る。

## 8. 認証失敗

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant Auth as Auth (auth.sandbox.com)
    participant Cognito

    Browser->>Auth: POST /login {username, password, csrf, rid}
    Auth->>Cognito: InitiateAuth
    alt パスワード誤り
        Cognito-->>Auth: NotAuthorizedException
    else ユーザー不在
        Cognito-->>Auth: UserNotFoundException
    else ロック中
        Cognito-->>Auth: NotAuthorizedException (Password attempts exceeded)
    end
    Note over Auth: 3ケースとも invalid_credentials。ユーザー列挙を防ぐ<br/>詳細は内部ログのみ
    Auth-->>Browser: 303 /login?error=invalid_credentials&rid=R1<br/>ユーザー名は URL に載せない
    Browser->>Auth: GET /login?error=invalid_credentials&rid=R1 → SPA
    Browser->>Auth: GET /api/login?rid=R1&error=invalid_credentials
    Auth-->>Browser: 200 {rid, csrfToken, errorMessage:"ユーザー名またはパスワードが正しくありません"}<br/>Set-Cookie: auth_csrf を発行し直す
    Note over Browser: SPA がフォームとエラーの Notice を描く
    Note over Auth: SSO Session作成なし。code発行なし
```

失敗の種類は `invalid_credentials` `user_disabled` `user_not_confirmed` `password_reset_required` `challenge_required` `unavailable`。クエリには種類だけを載せ、文言は `/api/login` が返す。`invalid_credentials` と `user_disabled` は同一文言。

## 9. MFAチャレンジ。フェーズ2

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant Auth as Auth (auth.sandbox.com)
    participant Cognito

    Browser->>Auth: POST /login {username, password, csrf, rid}
    Auth->>Cognito: InitiateAuth USER_SRP_AUTH
    Cognito-->>Auth: ChallengeName=SOFTWARE_TOKEN_MFA, Session=CS1
    Auth->>Auth: CS1 を rid に紐付けて一時保存。TTL 5分
    Auth-->>Browser: 302 /login/challenge?rid=R1
    Browser->>Auth: POST /login/challenge {code, csrf, rid}
    Auth->>Cognito: RespondToAuthChallenge {ChallengeName, Session=CS1, SOFTWARE_TOKEN_MFA_CODE}
    Cognito-->>Auth: AuthenticationResult
    Note over Auth: 以降は「1. 初回ログイン」の Cognito IdToken検証以降と同一
```

初期実装では ChallengeName が返った場合、`/login?error=challenge_required&rid=` へ戻し、SPA が `/api/login` から受け取った「この認証方式は現在未対応です」を表示して終了する。

## 10. Tenant Logout

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant TanakaCrm as TanakaCrm (tanaka.crm.sandbox.com)
    participant Sess
    participant Auth as Auth (auth.sandbox.com)

    Browser->>TanakaCrm: POST /auth/logout (tenant_session=T1, csrf)
    TanakaCrm->>TanakaCrm: CSRFトークン検証
    TanakaCrm->>Sess: crm:tanaka:T1 を取得し refresh_token を取り出す
    TanakaCrm->>Auth: POST /revoke token=RT1 (Back Channel, client認証 crm)
    Auth-->>TanakaCrm: 200
    TanakaCrm->>Sess: crm:tanaka:T1 削除
    TanakaCrm-->>Browser: 302 /<br/>Set-Cookie: tenant_session=#59; Max-Age=0
    Note over Browser: sso_session と他ホストのセッションは残る<br/>tanaka.crm → ログアウト<br/>suzuki.crm → ログイン済み<br/>tanaka.cms → ログイン済み
```

SSO Session が残るため、tanaka.crm で再度 `/auth/login` を踏むとパスワードなしで再ログインされる。これは仕様書19.1が定める挙動である。

## 11. Global Logout

tanaka.crm のログアウト完了画面から `https://auth.sandbox.com/logout?client_id=crm&tenant=tanaka` へ誘導する。

```mermaid
sequenceDiagram
    autonumber
    actor Browser
    participant Auth as Auth (auth.sandbox.com)
    participant SsoStore
    participant Cognito
    participant WebCrm as WebCrm (crm.sandbox.com)
    participant WebCms as WebCms (cms.sandbox.com)

    Browser->>Auth: GET /logout?client_id=crm&tenant=tanaka (sso_session=X1)
    Auth-->>Browser: 200 auth-web の SPA の index.html
    Browser->>Auth: GET /api/logout?client_id=crm&tenant=tanaka
    Auth-->>Browser: 200 {authenticated:true, csrfToken, returnTo:{label:"CRM (tanaka)", href:"https://tanaka.crm.sandbox.com/"}}<br/>Set-Cookie: auth_csrf
    Note over Browser: SPA が「Sandbox 全体からログアウトしますか」と<br/>csrf / client_id / tenant を hidden に持つフォームを描く
    Browser->>Auth: POST /logout {csrf, client_id=crm, tenant=tanaka}。HTML フォームの POST
    Auth->>SsoStore: X1 取得。sso:clients={crm, cms} と sid を特定
    Auth->>SsoStore: sid に紐付く Refresh Token を全失効
    Auth->>Cognito: RevokeToken(Cognito RefreshToken)
    Auth->>SsoStore: X1 と sso:sid / sso:clients を削除
    par Back-Channel Logout。サービスごとに1通。5 秒でタイムアウト
        Auth->>WebCrm: POST /auth/backchannel-logout<br/>logout_token (JWT: iss, aud=crm, sid, events)
        WebCrm->>WebCrm: logout_token 検証。crm:sid:<sid> から<br/>tanaka / suzuki の Tenant Session を全削除
        WebCrm-->>Auth: 200
    and
        Auth->>WebCms: POST /auth/backchannel-logout logout_token (aud=cms)
        WebCms->>WebCms: cms:sid:<sid> から tanaka の Tenant Session を削除
        WebCms-->>Auth: 200
    end
    Auth-->>Browser: 303 /logout?client_id=crm&tenant=tanaka<br/>Set-Cookie: sso_session=#59; Max-Age=0
    Browser->>Auth: GET /logout?client_id=crm&tenant=tanaka → SPA
    Browser->>Auth: GET /api/logout?client_id=crm&tenant=tanaka
    Auth-->>Browser: 200 {authenticated:false, returnTo:{label:"CRM (tanaka)", href:"https://tanaka.crm.sandbox.com/"}}
    Note over Browser: SPA が「Sandbox からログアウトしました」と<br/>「CRM (tanaka) に戻る」のリンクを描く<br/>crm の redirect_uri_template を tenant=tanaka で展開した origin
```

通知先は `sso:clients` の集合に含まれるサービスのうち、`oidc_clients.status` が `active` で `backchannel_logout_uri` を持つもの。サービスは logout_token の sid で、テナントを問わず自サービスの全セッションを削除する。
戻り先のリンクは `client_id` の `redirect_uri_template` を `tenant` で展開した URL の origin から `/api/logout` の `returnTo` として導く。`tenant` は SPA が描くフォームの hidden フィールドで POST まで引き継ぎ、POST 後の 303 で `/logout` のクエリに戻す。確認画面と完了画面は同じ `/logout` を SPA が `authenticated` で出し分ける。判断事項D19。
各通知は `AbortSignal.timeout(5000)` を付けて送り、応答しないサービスがあっても 5 秒で打ち切る。通知に失敗したサービスの Tenant Session は、Access Token 期限切れ後の Refresh で `invalid_grant` となり自然に失効する。最大遅延は Access Token 寿命の15分。

## 12. 異常系。認可レスポンスの改ざんと再利用

```mermaid
sequenceDiagram
    autonumber
    actor Attacker as Browser (攻撃者 / 異常系)
    participant TanakaCrm as TanakaCrm (tanaka.crm.sandbox.com)
    participant Auth as Auth (auth.sandbox.com)
    participant SsoStore

    rect rgb(255, 240, 240)
    Note over Attacker,SsoStore: ケースA: code再利用
    Attacker->>TanakaCrm: GET /auth/callback?code=使用済み&state=S1
    TanakaCrm->>Auth: POST /token code=使用済み
    Auth->>SsoStore: used=true を検知
    Auth->>SsoStore: 同codeから発行済みの refresh_token を失効
    Auth-->>TanakaCrm: 400 invalid_grant
    TanakaCrm-->>Attacker: 401 エラー画面。セッション未作成
    end

    rect rgb(255, 240, 240)
    Note over Attacker,SsoStore: ケースB: state不一致 (CSRF / レスポンス差し替え)
    Attacker->>TanakaCrm: GET /auth/callback?code=AC9&state=偽造
    TanakaCrm->>TanakaCrm: pre-auth の state と不一致
    TanakaCrm-->>Attacker: 400 エラー画面。code を Auth へ送らない
    end

    rect rgb(255, 240, 240)
    Note over Attacker,SsoStore: ケースC: redirect_uri不一致 (Open Redirect)
    Attacker->>Auth: GET /authorize?client_id=crm&redirect_uri=https://evil.example/cb
    Auth->>Auth: crm の redirect_uri_template に一致しない
    Auth-->>Attacker: 400 エラー画面。evil.example へはリダイレクトしない
    end

    rect rgb(255, 240, 240)
    Note over Attacker,SsoStore: ケースC2: 未登録テナントの slug
    Attacker->>Auth: GET /authorize?client_id=crm&redirect_uri=https://nobody.crm.sandbox.com/auth/callback
    Auth->>Auth: テンプレートには一致するが slug=nobody が tenants にない
    Auth-->>Attacker: 400 エラー画面。nobody.crm へはリダイレクトしない
    end

    rect rgb(255, 240, 240)
    Note over Attacker,SsoStore: ケースD: nonce不一致 (別セッションへの code 注入)
    Attacker->>TanakaCrm: GET /auth/callback?code=正規AC&state=S1 (被害者のcodeを攻撃者のブラウザで)
    TanakaCrm->>Auth: POST /token
    Auth-->>TanakaCrm: 200 {id_token}
    TanakaCrm->>TanakaCrm: id_token.nonce と攻撃者側 pre-auth の nonce が不一致
    TanakaCrm-->>Attacker: 401 エラー画面。セッション未作成
    end

    rect rgb(255, 240, 240)
    Note over Attacker,SsoStore: ケースE: 他サービスのclientでcode交換
    Attacker->>Auth: POST /token code=AC(crm向け) client認証=cms
    Auth->>Auth: code.client_id != cms
    Auth-->>Attacker: 400 invalid_grant
    end

    rect rgb(255, 240, 240)
    Note over Attacker,SsoStore: ケースF: 他テナントの code を自ホストで受ける
    Attacker->>TanakaCrm: GET /auth/callback?code=AC(suzuki向け)&state=S1
    TanakaCrm->>Auth: POST /token redirect_uri=https://tanaka.crm.sandbox.com/auth/callback
    Auth->>Auth: code.redirect_uri != リクエストの redirect_uri
    Auth-->>TanakaCrm: 400 invalid_grant
    Note over TanakaCrm: 万一通過しても id_token.tenant_slug != tanaka で 401
    end
```

エラー時の共通原則。

- 不正な redirect_uri へは一切リダイレクトしない。Auth Server 側でエラー画面を表示する
- code / Refresh Token の再利用検知時は同系列の Token を失効させる
- エラー詳細は内部ログのみ。ユーザーには汎用メッセージ
- 全ケースは [09-error-cases.md](./09-error-cases.md) を参照
