# User / Tenant / Membership DB設計とSession設計

## 結論

永続データは Identity DB と Business DB に分け、揮発データは Session Store に置く。
Identity DB は Auth Server が所有し、API Server は読み取り専用で参照する。判断事項D3。
ユーザーとテナントは別概念とし、サービスへのログイン可否と役割は tenant_service_members がテナント × サービス × ユーザーの単位で表す。認可は必ず tenant_service_members を根拠にする。tenant_members は会社横断の役割にだけ使い、ログイン可否には使わない。判断事項D16。
サービスとテナントも別概念とし、tenant_services が契約を表す。OIDC Client はサービスと1対1で、テナントには紐付かない。判断事項D13。
細かい権限は Identity DB にも Token にも置かず、各サービスの Business DB の member_permissions が役割の既定に対する allow / deny を持つ。
主キーはすべてサロゲート ID とし、client_id や slug は UNIQUE 制約で守る公開識別子にする。redirect_uri はサービスごとの `redirect_uri_template` で登録し、client_secret は oidc_client_secrets に複数行持てる。判断事項D15。

## 全体像

```mermaid
flowchart LR
    subgraph IdentityDB ["Identity DB  所有: Auth Server"]
        users
        tenants
        tenant_members["tenant_members<br/>会社横断の役割"]
        oidc_clients
        oidc_client_secrets
        tenant_services["tenant_services<br/>契約"]
        tenant_service_members["tenant_service_members<br/>サービスごとの割り当てと役割"]
    end
    subgraph BusinessDB ["Business DB  所有: API Server"]
        projects["projects 等の業務テーブル<br/>すべて tenant_id を持つ"]
        member_permissions["member_permissions<br/>役割の既定への allow / deny"]
    end
    subgraph SessionStore ["Session Store  Redis想定"]
        sso["sso:sess:*"]
        ssosid["sso:sid:*"]
        clients["sso:clients:*  集合"]
        authreq["sso:authreq:*"]
        code["sso:code:*"]
        rt["sso:rt:*"]
        rtfamily["sso:rtfamily:*  集合"]
        sidrt["sso:sidrt:*  集合"]
        csrf["sso:csrf:*"]
        ratelimit["sso:ratelimit:*  カウンタ"]
        tsess["clientId:sess:tenantSlug:*"]
        tsid["clientId:sid:sid:*  集合"]
        tpre["clientId:pre:tenantSlug:*"]
        tlock["clientId:lock:tenantSlug:*"]
        tratelimit["clientId:ratelimit:*  カウンタ"]
    end
    tenant_members --> users
    tenant_members --> tenants
    tenant_services --> tenants
    tenant_services --> oidc_clients
    tenant_service_members --> tenant_services
    tenant_service_members --> users
    oidc_client_secrets --> oidc_clients
    projects -. "tenant_id参照。FKなし" .-> tenants
    member_permissions -. "tenant_id / user_id / client_id 参照。FKなし" .-> tenant_service_members
```

Identity DB と Business DB は物理的に同一インスタンスでもよいが、スキーマを分け、API Server の Identity スキーマへの権限は SELECT のみにする。サンドボックスでは `identity` スキーマと `business` スキーマに分けている。

外部キーはすべてサロゲート ID を参照する。`oidc_clients.client_id` を参照する外部キーは持たない。`updated_at` を持つ表はトリガー `identity.touch_updated_at()` で更新時刻を自動更新する。

## Identity DB

### users

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,            -- ULID。ID Token の sub として外部へ出す
  cognito_sub   TEXT NOT NULL UNIQUE,        -- 正規識別子。Cognito User Pool の sub
  email         TEXT NOT NULL,
  name          TEXT,
  status        TEXT NOT NULL DEFAULT 'active', -- active / disabled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- 正規識別子は cognito_sub。仕様書14章
- id は内部代理キー。Client へ露出するのはこちら。Cognito固有値を境界の外へ出さないため
- email は表示用キャッシュ。突合キーにしない。Cognito 側で変更され得る
- JIT作成。Cognito 認証成功時に cognito_sub で検索し、なければ作成。判断事項D9

### tenants

```sql
CREATE TABLE tenants (
  id            TEXT PRIMARY KEY,            -- ULID
  slug          TEXT NOT NULL UNIQUE,        -- ホストの先頭ラベル。^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active', -- active / suspended
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- テナントは顧客企業。サービス横断で共有し、どのサービスにも同じ id と slug で現れる
- slug は予約語を禁止する。auth / api / www / admin 等
- status=suspended のテナントには `/authorize` で access_denied を返す。理由は tenant_suspended

### tenant_members

```sql
CREATE TABLE tenant_members (
  tenant_id     TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status        TEXT NOT NULL DEFAULT 'active', -- active / invited / disabled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX tenant_members_user_id_idx ON tenant_members (user_id);
```

- 会社横断の役割。管理者や請求担当のような、サービスに依らない立場を表す。判断事項D16
- ログイン可否には使わない。`/authorize`、refresh_token grant、API Server はこの表を参照しない
- サービスへの割り当てと役割は tenant_service_members に持つ。tanaka の owner であっても、tanaka の cms に割り当てがなければ tanaka.cms には入れない
- role は固定enum。判断事項D8

### oidc_clients

```sql
CREATE TABLE oidc_clients (
  id                     TEXT PRIMARY KEY,   -- ULID。内部参照と外部キーはこちら
  client_id              TEXT NOT NULL UNIQUE, -- OAuth の公開識別子。サービスID。crm / cms。^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$
  name                   TEXT NOT NULL,      -- 表示名。CRM / CMS
  audience               TEXT NOT NULL,      -- サービスの API origin。Access Token の aud
  redirect_uri_template  TEXT NOT NULL CHECK (redirect_uri_template LIKE '%{tenant}%'), -- {tenant} を 1 か所だけ含む
  allowed_scopes         TEXT[] NOT NULL DEFAULT ARRAY['openid','profile','email'],
  backchannel_logout_uri TEXT,               -- サービス単位。テナントに依存しない
  status                 TEXT NOT NULL DEFAULT 'active', -- active / disabled
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- 1 Client = 1 サービス。テナントには紐付かないため tenant_id 列を持たない
- id はサロゲート主キー。oidc_client_secrets と tenant_services の外部キーは id を参照する。client_id を変更しても外部キーは連鎖しない
- redirect_uri_template はサービスに 1 つ。ローカルは `http://{tenant}.crm.localhost:3001/auth/callback`、本番は `https://{tenant}.crm.example.com/auth/callback`。`{tenant}` をテナント slug で展開した文字列と redirect_uri を完全一致で比較する
- 認可リクエストのテナントは redirect_uri をテンプレートに当てて slug を取り出し、tenants を slug で引いて決める。crm と `http://suzuki.crm.localhost:3001/auth/callback` なら suzuki
- テンプレートに一致しない、または slug が tenants にない redirect_uri は `invalid_redirect_uri` としてリダイレクトせず 400 にする。テナントに紐付かない戻り先は持たない
- audience は API Server が `API_BASE_URL` から導く値と完全一致させる。ローカルは `http://api.crm.localhost:3002`
- backchannel_logout_uri はサービスのベースホスト。ローカルは `http://crm.localhost:3001/auth/backchannel-logout`

### oidc_client_secrets

```sql
CREATE TABLE oidc_client_secrets (
  id              TEXT PRIMARY KEY,          -- ULID
  oidc_client_id  TEXT NOT NULL REFERENCES oidc_clients (id) ON DELETE CASCADE,
  secret_hash     TEXT NOT NULL,             -- sha256$<base64url>
  status          TEXT NOT NULL DEFAULT 'active', -- active / revoked
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);
CREATE INDEX oidc_client_secrets_active_idx ON oidc_client_secrets (oidc_client_id)
  WHERE status = 'active';
```

- client_secret はサービスごとに複数持てる。`/token` と `/revoke` は active な行のいずれかに一致すれば認証成功とする
- ローテーションは、新しい secret を active で挿入し、サービスの `CLIENT_SECRET` を差し替えてから、旧行を revoked にする。切替中は新旧どちらでも通るため無停止で進められる
- client_secret は 32 バイト以上の乱数とし、DB にはハッシュのみ保存する。`*-web` の `CLIENT_SECRET` と provision の `SERVICES[].clientSecret` は 43 文字以上を起動時に検証する。ローカルでは `crm-v3R_5OBDCC6k8EeDKB6l5YltYVTSeJQZxpU-2-PE7VU` `cms-D-t4BfncXGWLx6FnGD0DW1gJroNFYm1GDm8QSgOYNLA` の固定値
- ハッシュは SHA-256。client_secret は人が選ぶパスワードではなく十分に長い乱数であるため KDF を使わない。scrypt は `/token` のたびに数十ミリ秒イベントループを止めるため採用しない。`packages/shared/src/secret-hash.ts`

### tenant_services

```sql
CREATE TABLE tenant_services (
  tenant_id       TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  oidc_client_id  TEXT NOT NULL REFERENCES oidc_clients (id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active', -- active / suspended
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, oidc_client_id)
);
CREATE INDEX tenant_services_oidc_client_id_idx ON tenant_services (oidc_client_id);
```

- 契約。テナントがそのサービスを利用できるかを表す。購買、請求、席数、解約はこの単位で行う
- `/authorize` と refresh_token grant は tenants.status の後、tenant_service_members の前にこの表を確認する。行がないか status が active でなければ not_contracted。検索キーは oidc_clients.id
- ポータルは、この表が active で、かつ tenant_service_members に割り当てがあるサービスだけを入口として表示する
- テナント追加は tenants と tenant_services の行と、利用者分の tenant_service_members を足すだけで完了する。redirect_uri はテンプレートから導くため、テナントごとの登録は不要

### tenant_service_members

```sql
CREATE TABLE tenant_service_members (
  tenant_id       TEXT NOT NULL,
  oidc_client_id  TEXT NOT NULL,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status          TEXT NOT NULL DEFAULT 'active', -- active / invited / disabled
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, oidc_client_id, user_id),
  FOREIGN KEY (tenant_id, oidc_client_id)
    REFERENCES tenant_services (tenant_id, oidc_client_id) ON DELETE CASCADE
);
CREATE INDEX tenant_service_members_user_id_idx ON tenant_service_members (user_id);
```

- サービスごとの割り当て。招待はこの単位で行い、役割もサービスごとに持つ。判断事項D16
- 複合外部キーで契約を参照するため、契約のないサービスに人を割り当てられない。契約を消せば割り当ても CASCADE で消える
- `/authorize` と refresh_token grant は契約の後にこの表を `(tenant_id, oidc_client_id, user_id)` で引く。行がなければ no_membership、あるが active でなければ membership_inactive。no_membership は「このテナントのこのサービスに割り当てがない」で、別サービスの割り当てでは通らない
- API Server は Token の tenant_id と client_id、sub でこの表を毎リクエスト再検証し、role を取る。role は Token に載せない
- 1 ユーザーが同じテナントでもサービスごとに違う役割を持てる。alice は tanaka の crm と cms で owner、suzuki の crm で viewer
- 細かい権限はこの表には持たない。役割の既定に対する個別の許可 / 拒否は各サービスの DB の member_permissions が持つ

### 初期データ

サービス oidc_clients。

| id | client_id | name | audience | redirect_uri_template | backchannel_logout_uri |
| --- | --- | --- | --- | --- | --- |
| 01J00000000000000000000CRM | crm | CRM | http://api.crm.localhost:3002 | http://{tenant}.crm.localhost:3001/auth/callback | http://crm.localhost:3001/auth/backchannel-logout |
| 01J00000000000000000000CMS | cms | CMS | http://api.cms.localhost:3004 | http://{tenant}.cms.localhost:3003/auth/callback | http://cms.localhost:3003/auth/backchannel-logout |

client_secret oidc_client_secrets。

| id | oidc_client_id | 平文 | status |
| --- | --- | --- | --- |
| 01J0000000000000000CRMSEC1 | 01J00000000000000000000CRM | crm-v3R_5OBDCC6k8EeDKB6l5YltYVTSeJQZxpU-2-PE7VU | active |
| 01J0000000000000000CMSSEC1 | 01J00000000000000000000CMS | cms-D-t4BfncXGWLx6FnGD0DW1gJroNFYm1GDm8QSgOYNLA | active |

テナント。

| id | slug | name |
| --- | --- | --- |
| 01J00000000000000000TANAKA0 | tanaka | Tanaka Inc. |
| 01J00000000000000000SUZUKI0 | suzuki | Suzuki Ltd. |

契約 tenant_services。

| tenant | oidc_client_id | サービス |
| --- | --- | --- |
| tanaka | 01J00000000000000000000CRM | crm |
| tanaka | 01J00000000000000000000CMS | cms |
| suzuki | 01J00000000000000000000CRM | crm |

suzuki.cms.localhost:3003 の redirect_uri は cms のテンプレートに一致し slug=suzuki も tenants にあるため `/authorize` は受理するが、契約がないため access_denied になる。

サービスごとの割り当て tenant_service_members。

| user | tenant | oidc_client_id | サービス | role |
| --- | --- | --- | --- | --- |
| alice | tanaka | 01J00000000000000000000CRM | crm | owner |
| alice | tanaka | 01J00000000000000000000CMS | cms | owner |
| alice | suzuki | 01J00000000000000000000CRM | crm | viewer |
| bob | suzuki | 01J00000000000000000000CRM | crm | admin |

suzuki の cms は契約がないため割り当ても存在しない。bob は tanaka のどのサービスにも割り当てがなく、tanaka.crm を開くと no_membership になる。
carol は Cognito 側にのみ存在し、どのサービスにも割り当てがない。ログインは成功するが `/authorize` で no_membership になり、ポータルには「利用できるサービスがありません。管理者に招待を依頼してください。」と出る。

会社横断の役割 tenant_members。ログイン可否には使わない。

| user | tenant | role |
| --- | --- | --- |
| alice | tanaka | owner |
| bob | suzuki | owner |

## Business DB

API Server が所有する。すべての業務テーブルに tenant_id を持たせる。

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,   -- Identity DB の tenants.id。スキーマをまたぐため FK は張らない
  name        TEXT NOT NULL,
  created_by  TEXT NOT NULL,   -- users.id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX projects_tenant_id_idx ON projects (tenant_id);
```

初期データは tanaka に「Tanaka Project 1」「Tanaka Project 2」、suzuki に「Suzuki Project 1」。

Row Level Security を併用する場合。判断事項D11。

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY projects_tenant_isolation ON projects
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
```

API Server はトランザクション開始時に `SET LOCAL app.tenant_id = :tenant_id` を Token 由来の値で実行する。詳細は [07-api-auth-design.md](./07-api-auth-design.md)。

### member_permissions

サービス固有の細かい権限。役割から導く既定の権限に対して、個別に許可 / 拒否を上書きする。判断事項D16。

```sql
CREATE TABLE member_permissions (
  tenant_id   TEXT NOT NULL,   -- Identity DB の tenants.id
  user_id     TEXT NOT NULL,   -- users.id
  client_id   TEXT NOT NULL,   -- このサービスの client_id。サンドボックスは 1 DB を複数サービスで共有するため持つ
  permission  TEXT NOT NULL,   -- projects:write など。API Server の permission 名
  effect      TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, client_id, permission)
);
ALTER TABLE member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY member_permissions_tenant_isolation ON member_permissions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
```

- Token には載せない。API Server がリクエストごとに `app.tenant_id` を設定したトランザクションで読む。変更は次のリクエストから反映される
- 権限の確定は 役割の既定 ∪ allow − deny。deny が優先し、API Server が知らない permission 名の行は無視する
- サンドボックスでは crm-api と cms-api が同じ DB を使うため client_id 列で分ける。実運用では各サービスの DB がこの表を持ち、client_id 列は不要になる
- Identity DB には置かない。Auth Server がサービスごとの権限語彙を知る必要をなくすため

初期データは alice が tanaka の cms で `projects:write` を deny。alice は tanaka.cms の owner だが Project を作れない。

## Session Store

Redis 想定。すべて TTL 付き。ローカル検証はインメモリ Map。
ストアは用途ごとにプレフィックスを分けて作る。`packages/shared/src/store-factory.ts` の `createStoreFactory` が `REDIS_URL` の有無で Redis とインメモリを切り替え、`kv` `set` `counter` の 3 種類を返す。auth-api は `adapters/stores.ts` の `createAuthStores`、`*-web` は `startWebCore` がプレフィックスを決める。Redis 上の実キーは `<プレフィックス>:<キー>` になる。テストは `createMemoryStoreFactory` を使う。
一覧は `SetStore`、一回限りの消費は `getAndDelete`、ロックは `setIfAbsent`、レート制限は `CounterStore` を使う。値を読んで書き戻す形の一覧更新は持たない。

| プレフィックス | 種類 | 内容 |
| --- | --- | --- |
| `sso:sess` | kv | SSO Session |
| `sso:sid` | kv | sid → SSO Session ID |
| `sso:clients` | set | SSO Session ID → code を発行した client_id の集合。Global Logout の通知先 |
| `sso:authreq` | kv | 認可リクエスト |
| `sso:code` | kv | Authorization Code |
| `sso:rt` | kv | Refresh Token |
| `sso:rtfamily` | set | familyId → 系列の Refresh Token の集合 |
| `sso:sidrt` | set | sid → Refresh Token 系列 ID の集合 |
| `sso:csrf` | kv | ログインと Global Logout の CSRF トークン |
| `sso:ratelimit` | counter | レート制限の固定窓カウンタ |
| `<clientId>:sess` | kv | Tenant Session |
| `<clientId>:sid` | set | sid → Tenant Session キーの集合 |
| `<clientId>:pre` | kv | pre-auth |
| `<clientId>:lock` | kv | Refresh ロック。`setIfAbsent` で取得 |
| `<clientId>:ratelimit` | counter | `/auth/*` のレート制限カウンタ |
寿命はストアの TTL で管理し、値には `createdAt` のような期限計算用の項目を持たせない。アイドル期限と絶対期限を持つ SSO Session と Tenant Session は例外で、`packages/shared/src/session-expiry.ts` の共通判定を使う。

### SSO Session

プレフィックス `sso:sess`、キー `<sso_session_id>`。TTL は絶対期限。

```typescript
type SsoSession = {
  id: string;                 // 256bit random。Cookie値
  sid: string;                // ID Token に載せる公開識別子
  userId: string;             // users.id
  encryptedCognitoTokens: string; // Cognito の Access / ID / Refresh Token を暗号化した文字列
  authTime: number;
  createdAt: number;
  lastSeenAt: number;         // アイドル判定。/authorize ごとに更新。書き込みは 60 秒に 1 回に間引く
};
```

cognito_sub は保持しない。users.id で引けるため必要になった時点で Identity DB から取る。
逆引き `sso:sid` の `<sid> → sso_session_id` を持ち、Back-Channel Logout と Refresh Token 失効に使う。
code を発行したサービスは値には持たず、`sso:clients` の `<sso_session_id> → client_id の集合` に置く。例 `{crm, cms}`。Global Logout の通知先になる。集合にするのは、crm と cms への `/authorize` が同時に走ってもどちらの追加も落ちないようにするため。
`POST /login` が成功したとき、Cookie が指す旧 SSO Session があれば `sso:sess` `sso:sid` `sso:clients` から破棄してから新しい ID を書く。

### 認可リクエスト

プレフィックス `sso:authreq`、キー `<rid>`。TTL 30分。ログイン画面を挟む間の保持用。

```typescript
type AuthorizationRequest = {
  clientId: string;           // サービス
  tenantId: string;           // redirect_uri をテンプレートに当てて解決したテナント
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
};
```

`/authorize` で検証済みの値だけを保存する。ログイン成功後は `usecases/pending-authorization.ts` が Client がまだ active でテナントが存在することだけを確かめ、パラメータは再検証せずにアクセス判定と code 発行へ進む。

### Authorization Code

プレフィックス `sso:code`、キー `<code>`。TTL 60秒。

```typescript
type AuthorizationCode =
  | {
      used: false;
      code: string;
      clientId: string;
      redirectUri: string;
      scope: string;
      nonce: string;
      codeChallenge: string;
      userId: string;
      tenantId: string;
      sid: string;
      ssoSessionId: string;
      authTime: number;
    }
  | {
      used: true;             // 再利用検知用。交換時に発行した Refresh Token の系列を持つ
      code: string;
      familyId: string;
    };
```

`used` の更新は `GETDEL` または Lua スクリプトで取得と削除を同時に行い、二重交換を排除する。

### Refresh Token

プレフィックス `sso:rt`、キー `<token>`。TTL 12時間。

```typescript
type RefreshToken = {
  token: string;
  familyId: string;           // ローテーション系列。再利用検知時に系列全体を失効
  clientId: string;
  userId: string;
  tenantId: string;
  sid: string;
  ssoSessionId: string;
  scope: string;
  authTime: number;
  status: "active" | "rotated" | "revoked";
};
```

逆引き `sso:rtfamily` の `<familyId> → token の集合` と `sso:sidrt` の `<sid> → familyId の集合` を `SetStore` で持つ。系列の値は token の一覧だけで、失効フラグは持たない。系列の失効は集合の全 token を並列に revoked へ更新する。refresh_token grant の検証は `validateRefreshContext` にまとめ、どの段階で失敗しても系列を 1 回だけ失効させる。

消費は consume-first。`consumeRefreshToken` が `getAndDelete` で取り出し、直後に `status: "rotated"` で書き戻してから検証に進む。取り出した値が `active` でなければそのまま書き戻して再利用として扱う。同じ値を同時に提示されても取り出せるのは 1 回だけで、もう一方は存在しないため `invalid_grant` になり、系列は失効しない。別 Client からの提示は `client_mismatch` として系列全体を失効させる。

### Tenant Session

プレフィックス `<clientId>:sess`、キー `<tenantSlug>:<session_id>`。例 プレフィックス `crm:sess`、キー `tanaka:T1`。TTL は絶対期限。

```typescript
type TenantSession = {
  id: string;                 // Cookie値
  tenantSlug: string;         // Host から解決したテナント
  userId: string;             // ID Token の sub
  tenantId: string;
  sid: string;
  email: string | null;
  name: string | null;
  accessToken: string;        // API 呼び出し用
  accessTokenExpiresAt: number;
  refreshToken: string;
  csrfToken: string;          // Tenant Logout 用
  createdAt: number;
  lastSeenAt: number;         // 書き込みは 60 秒に 1 回に間引く
};
```

- 1 プロセスは 1 サービスを担当するため、サービスはストアのプレフィックスで分け、値には clientId を持たない。プロセス内では tenantSlug をキーに含めて空間を分ける。Cookie 値が同じでも別ホストのセッションを引けない
- 逆引きはプレフィックス `<clientId>:sid`、キー `sid:<sid> → sessionKey の集合`。`SetStore` で持ち、セッション作成時に追加、`destroySession` で要素を削除する。Back-Channel Logout はサービス単位で届くため、同じ sid で作られたそのサービスの全テナントのセッションをまとめて削除できる
- `lastSeenAt` の更新は書く直前にセッションを読み直す。並行する Refresh が更新した Token を古い値で上書きしない
- role は保存しない。表示用に必要なら API から都度取得する

### Refresh ロック

プレフィックス `<clientId>:lock`、キー `<tenantSlug>:<session_id>`。値は `"1"`。TTL は `REFRESH_LOCK_TTL_SECONDS` の 10 秒。
`ensureFreshAccessToken` が `setIfAbsent` で取り、Refresh の完了後に削除する。取れなかったリクエストは 100 ミリ秒間隔で最大 30 回セッションを読み直し、Refresh 済みなら続行する。同じセッションで Refresh Token を二重に送らないための排他。

### レート制限カウンタ

プレフィックスは auth-api が `sso:ratelimit`、`*-web` が `<clientId>:ratelimit`。キー `<名前>:<IP など>:<窓番号>`。TTL は窓の長さ。
`CounterStore.increment` で加算し、初回の加算で TTL を付ける。制限値は [08-security-design.md](./08-security-design.md) を参照。

### pre-auth

プレフィックス `<clientId>:pre`、キー `<tenantSlug>:<id>`。`<id>` は Cookie 値。TTL 30分。`/auth/callback` で `getAndDelete` により取得と同時に消す。

```typescript
type PreAuthState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;           // 自ドメイン内パスのみ
};
```

## 抽象化インターフェース

```typescript
interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  getAndDelete(key: string): Promise<T | undefined>;                    // code と Refresh Token の一回限り消費
  setIfAbsent(key: string, value: T, ttlSeconds: number): Promise<boolean>; // ロック。書けたら true
}

interface SetStore {
  add(key: string, member: string, ttlSeconds: number): Promise<void>;
  remove(key: string, member: string): Promise<void>;
  members(key: string): Promise<ReadonlyArray<string>>;
  delete(key: string): Promise<void>;
}

interface CounterStore {
  increment(key: string, ttlSeconds: number): Promise<number>; // 加算後の値。初回で TTL を付ける
}
```

| 環境 | 実装 |
| --- | --- |
| ローカル検証 | インメモリ Map + 期限管理。`REDIS_URL` 未設定時に `createStoreFactory` が選ぶ。`getAndDelete` は await を挟まず読んで消し、並行呼び出しでも値を返すのは 1 回 |
| 本番 | Redis。`getAndDelete` は GETDEL、`setIfAbsent` は SET NX、`SetStore` は SADD / SREM / SMEMBERS、`increment` は INCR と EXPIRE NX。`REDIS_URL` 設定時に `createStoreFactory` が選ぶ |

## 障害時の考慮

| 障害 | 影響 | 対処 |
| --- | --- | --- |
| Session Store 停止 | 新規ログインと Refresh が失敗。既存 Tenant Session も参照できない | Redis の冗長化。Auth Code は揮発を許容 |
| Identity DB 停止 | `/authorize` の契約・割り当て判定と API 認可が失敗 | API Server は割り当てを短時間キャッシュしてよいが、キャッシュ期間は Access Token 寿命以下 |
| Cognito 停止 | 新規認証のみ失敗。SSO Session 有効中のユーザーは影響なし | Cognito Token の更新失敗は SSO Session 失効として扱う |
