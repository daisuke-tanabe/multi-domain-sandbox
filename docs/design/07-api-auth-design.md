# API認証・認可・Tenant Isolation設計

## 結論

API Server は Resource Server として Auth Server 発行の Access Token のみを受け付ける。
API はサービスごとに `api.<service>.sandbox.com` のホストを持ち、受け付ける aud はリクエストの Host から導く。CRM の Token は api.cms では通らない。
テナントコンテキストは Token の `tenant_id` だけから決め、リクエストのパス・クエリ・ボディに含まれるテナント指定は認可根拠にしない。
認可は自サービスの DB だけで行う。Token の `tenant_id` と `sub` で members を読んで役割を取り、役割の既定に permission_overrides を重ねて権限を確定する。Identity DB には接続しない。役割も権限も Token には載せない。判断事項D17。
`packages/api-core` はサービス API のフレームワークで、役割と権限の語彙は各サービスが `ServiceDefinition` で宣言する。管理アカウントの招待と権限編集はどのサービスにも同じ `/v1/members` で提供し、招待は Auth Server の管理 API を経由する。
データアクセスは tenant_id でアプリ層とDB層の二重で分離する。

## 処理順序

仕様書17章の順序をミドルウェア構成に対応させる。

```mermaid
flowchart TD
    A["Request"] --> A0["0. Host → aud<br/>API_BASE_URL のホストと一致する Host か"]
    A0 -- 未知の Host --> E0["404 not_found"]
    A0 --> B["1. Authentication<br/>Bearer Token 抽出と JWT 検証<br/>aud が Host 由来の値と一致"]
    B -- 失敗 --> E1["401 unauthorized"]
    B --> C["2. Member<br/>自 DB の members を (tenant_id, sub) で検索<br/>なければ defaultRole で作る"]
    C -- status != active --> E2["403 forbidden"]
    C --> F["3. Role / Permission<br/>role の既定 ∪ allow − deny<br/>自 DB の permission_overrides を読む"]
    F --> G["4. Authorization<br/>endpoint が要求する permission を確認"]
    G -- 不足 --> E2
    G --> H["5. Data Access<br/>tenant_id を Repository と RLS に強制"]
    H --> I["Response"]
```

0 から 3 までは `packages/api-core/src/application/resolve-tenant-context.ts` の `resolveTenantContext` が担う。Host 確認 → Bearer 抽出 → Access Token 検証 → `MemberRepository.findWithOverrides(tenantId, userId)` で member 行と上書きを 1 つのトランザクションで取得、member 行がなければ `ServiceDefinition.defaultRole` で `upsert` → status の確認 → `resolvePermissions(definition, role, overrides)` で権限を確定 → `TenantContext` を返す。ミドルウェア `auth/middleware.ts` はその Result を HTTP ステータスと `WWW-Authenticate` に写像するだけで、判定ロジックを持たない。

「入れるか」の判定はここにない。Auth Server が `/authorize` と refresh_token grant で user → tenant → 契約 → 割り当ての順に判定済みで、API は Token が有効であればこのテナントのこのサービスに入れる人だと扱う。割り当てを外された人は Auth Server がそのサービスの Refresh Token 系列を即時に失効させ、Back-Channel Logout で Tenant Session を消す。発行済みの Access Token は寿命の 15 分まで有効だが、BFF がもう使わない。API 側で即時に止めるなら members.status を disabled にする。

処理順序の前に全ルート共通のミドルウェアを通す。body は Hono の `bodyLimit` で 64 KB に制限し、投稿の本文を含む業務 API の JSON はこの範囲で足りる。応答には `Cache-Control: no-store` を付ける。`/healthz` は Host 確認と Token 検証の前に返す。

## 0. Host → aud

API はサービスごとに別プロセスで、1 プロセスは 1 つの Host だけを受ける。環境変数 `API_BASE_URL` の値をそのまま aud とし、リクエストの Host が `API_BASE_URL` のホストと一致することを要求する。`ApiAppOptions.audience` は文字列 1 つで、Host から aud を引く表は持たない。
環境変数は `packages/api-core/src/config.ts` の `loadApiCoreConfig` が `parseEnv` で検証する。`PORT` `API_BASE_URL` `ISSUER` `AUTH_BACKCHANNEL_URL` `DATABASE_URL` `CLIENT_ID` `CLIENT_SECRET` で、`PUBLIC_SCHEME` は持たない。`DATABASE_URL` は自サービスの DB、`CLIENT_ID` と `CLIENT_SECRET` は Auth Server の管理 API を呼ぶ Client 認証で `*-web` と同じ値。`CLIENT_SECRET` は 43 文字以上を要求する。

| プロセス | API_BASE_URL | aud | 受け付ける Host | DATABASE_URL |
| --- | --- | --- | --- | --- |
| crm-api | http://api.crm.localhost:3002 | http://api.crm.localhost:3002 | api.crm.localhost:3002 | postgres://crm_app:crm_app@127.0.0.1:5433/crm |
| cms-api | http://api.cms.localhost:3004 | http://api.cms.localhost:3004 | api.cms.localhost:3004 | postgres://cms_app:cms_app@127.0.0.1:5434/cms |
| それ以外の Host | | | 404 not_found。Token 検証に進まない | |

aud は oidc_clients.audience と完全一致させる。provision は `SERVICES[].apiBaseUrl` を oidc_clients.audience に書くため、同じ値を `API_BASE_URL` に与えれば一致する。crm-api に届いた cms 向けの Token は aud 不一致で 401 になる。

## 1. Authentication

| 検証項目 | 内容 |
| --- | --- |
| ヘッダ | `Authorization: Bearer <jwt>`。Cookie は受け付けない |
| 署名 | Auth Server の JWKS。RS256 のみ。kid で鍵選択。`RemoteJwksSource` を `AUTH_BACKCHANNEL_URL` の `/jwks` に向ける |
| iss | `https://auth.sandbox.com` |
| aud | `API_BASE_URL` が aud に含まれること。CRM の Token を api.cms に送ると 401。ID Token を誤って送られても拒否 |
| exp / iat | 許容スキュー 30秒 |
| 必須 claims | sub, tenant_id, tenant_slug, sid, client_id。sid と client_id は Auth Server 発行の Access Token であることの確認に使う。role や permissions の claim は受け取っても無視する |

失敗時は `401` と `WWW-Authenticate: Bearer error="invalid_token"` を返す。期限切れは `error_description="expired"` を付け、Tenant Web Application が Refresh を判断できるようにする。この文字列は `packages/shared/src/oidc-protocol.ts` の `TOKEN_EXPIRED_DESCRIPTION` で両者が共有する。

JWKS は 10 分キャッシュし、未知の kid のときだけ強制再取得する。強制再取得の間引きは通常の取得とは別に数え、通常取得の直後でも未知の kid が来れば 1 回は再取得し、その後 60 秒は間引く。`packages/shared/src/jwks.ts`。

## 2. Member

- `sub` を users.id、`tenant_id` を tenants.id として扱い、自サービス DB の `<schema>.members` を `(tenant_id, user_id)` で引く
- 行がなければ `ServiceDefinition.defaultRole` で作る。auth を通れる人が招待を経ずに初めて API を呼んだ場合で、email と name は NULL になる。CRM も CMS も defaultRole は最下位の viewer
- status が active でなければ 403 forbidden
- Identity DB は参照しない。users.status や tenants.status の変化は Auth Server が Refresh で拒否し、最大 15 分で反映される
- 参照はリクエスト単位でキャッシュしない。役割の変更を即時反映するため

## 3. Role / Permission

role は自サービス DB の members から取得した値のみ使う。Token に role があっても無視する。

### ServiceDefinition

役割と権限の語彙はサービスごとに `apps/<service>-api/src/definition.ts` で `defineService` に渡す。`packages/api-core/src/service-definition.ts`。

```typescript
interface ServiceDefinition<Role extends string, Permission extends string> {
  roles: ReadonlyArray<Role>;          // 上から順に強い役割。先頭が最上位
  defaultRole: Role;                   // member 行がない人に付ける役割。最下位にする
  permissions: ReadonlyArray<Permission>;  // サービス固有の権限。members:* は含めない
  rolePermissions: Record<Role, ReadonlyArray<Permission | MemberPermission>>;
}
```

- `members:read` `members:invite` `members:manage` はどのサービスにも要るため api-core が必ず足す。`allPermissions(definition)` がサービス固有の権限と合わせて返す
- `isRole` `isPermission` が入力検証に使われ、語彙にない role や permission は 400 `invalid_request`。CRM の `admin` を CMS に送ると拒否される

CRM。`apps/crm-api/src/definition.ts`。

| role | permissions |
| --- | --- |
| owner | end_users:read / create / update / delete / unmask、members:read / invite / manage |
| admin | end_users:read / create / update / delete / unmask、members:read / invite |
| member | end_users:read / create / update、members:read |
| viewer | end_users:read、members:read |

CMS。`apps/cms-api/src/definition.ts`。

| role | permissions |
| --- | --- |
| owner | posts:read / create / update / delete、members:read / invite / manage |
| editor | posts:read / create / update / delete、members:read |
| viewer | posts:read、members:read |

### 権限の上書き

役割の既定に対して、個別の許可 / 拒否を重ねる。判断事項D16、D17。

- 上書きは自サービスの DB の `<schema>.permission_overrides(tenant_id, user_id, permission, effect)` に持つ。effect は allow / deny
- `MemberRepository.findWithOverrides(tenantId, userId)` が member 行と一緒に `app.tenant_id` を設定した 1 つのトランザクションで読み、`{ member, overrides }` を返す。業務テーブルと同じ RLS ポリシーがかかる。`replaceOverrides` は unnest で全行を 1 文で入れ替える
- `resolvePermissions(definition, role, overrides)` は 役割の既定 ∪ allow − deny を返す。deny が allow より優先し、`ServiceDefinition` にない permission 名の行は無視する
- 例。alice は tanaka の cms で owner だが、cms の DB に `posts:create` の deny があるため `POST /v1/posts` は 403 になる。`GET /v1/posts` と `PATCH /v1/posts/:id` は通る
- 例。suzuki の crm で viewer の alice に `end_users:unmask` の allow があるため、役割を変えずにマスクなしで読める

### 権限を Token に載せない理由

- 権限の変更を次のリクエストから反映する。Token に載せると寿命の 15 分間は古い権限で通る
- Auth Server がサービスごとの役割と権限の語彙を知らなくてよい。語彙はサービスが `ServiceDefinition` で決め、Auth Server は「入れるか」だけを扱う
- Token がサービス数と権限数に比例して肥大化しない

### TenantContext と /v1/me

```typescript
type TenantContext = {
  tenantId: string;                       // Access Token の tenant_id
  tenantSlug: string;                     // Access Token の tenant_slug
  userId: string;                         // Access Token の sub
  clientId: string;                       // Access Token の client_id。このサービスの識別子
  member: Member;                         // 自 DB の members の行。role と status を持つ
  permissions: ReadonlySet<string>;       // 役割の既定に上書きを重ねた結果。認可はこれで判定する
};
```

`GET /v1/me` は permission を要求せず、確定した権限をソート済み配列で返す。あわせてサービスの roles と permissions の語彙を返し、画面はこれで表示を出し分ける。Tenant Web Application は role を表示にだけ使い、操作可否は API の応答で決める。

```json
{
  "user": { "id": "01J0000000000000000000ALICE", "email": "alice@example.com", "name": "Alice" },
  "tenant": { "id": "01J00000000000000000SUZUKI0", "slug": "suzuki" },
  "role": "viewer",
  "permissions": ["end_users:read", "end_users:unmask", "members:read"],
  "service": {
    "clientId": "crm",
    "roles": ["owner", "admin", "member", "viewer"],
    "permissions": ["end_users:read", "end_users:create", "end_users:update", "end_users:delete", "end_users:unmask", "members:read", "members:invite", "members:manage"]
  }
}
```

## 4. Authorization

各エンドポイントは要求 permission を宣言する。

```typescript
app.get('/v1/end-users', requirePermission('end_users:read'), handler);
app.post('/v1/end-users', requirePermission('end_users:create'), handler);
app.delete('/v1/end-users/:id', requirePermission('end_users:delete'), handler);
```

- `requirePermission` は `TenantContext.permissions` の集合に要求 permission が含まれるかで判定する。role を直接見ない
- サービス固有のルートは `/v1/*` 配下に置き、`authenticate` の後ろに mount される。`startApiCore(component, {definition, schema, routes(pool)})` に `Hono<ApiEnv>` の配列で渡す
- オブジェクト単位の所有者チェックが必要な場合は handler 内で追加し、tenant_id 一致の後に評価する

## 5. Data Access と Tenant Isolation

### アプリ層

- Repository は tenant_id を必須引数に取る。省略可能な引数にしない
- tenant_id はリクエストコンテキストの Token 由来値のみ。ハンドラがリクエストパラメータから tenant_id を組み立てることを禁止する
- 単一リソース取得は `WHERE tenant_id = :tenant_id AND id = :id`。見つからなければ 404。他テナントのIDを指定しても存在の有無を区別しない
- 一括更新・削除も必ず tenant_id 条件を含める

```typescript
class PgEndUserRepository {
  findById(tenantId: string, id: string) {
    return withTenant(this.pool, tenantId, (client) =>
      client.query('SELECT ... FROM crm.end_users WHERE tenant_id = $1 AND id = $2', [tenantId, id]));
  }
}
```

### DB層

判断事項D11。アプリ層のバグに対する二重防御として Row Level Security を使う。`packages/api-core/src/db.ts` の `withTenant(pool, tenantId, fn)` がトランザクションを開き、`set_config('app.tenant_id', $1, true)` を Token 由来の値で実行してから `fn` を呼ぶ。

```sql
BEGIN;
SELECT set_config('app.tenant_id', '<token_tenant_id>', true);
-- 以降のクエリは RLS により tenant_id が一致する行のみ見える
COMMIT;
```

- API Server の DB ロールは NOBYPASSRLS。`crm_app` `cms_app`
- `FORCE ROW LEVEL SECURITY` を掛けるため、表の所有者はアプリのロールと分ける。表は postgres が所有し、アプリのロールには DML だけを与える
- members と permission_overrides にも同じポリシーを掛ける。ポリシーは `<schema>.current_tenant_id()` を通して `app.tenant_id` を読む。init の最後の DO ブロックがスキーマ内の全表に FORCE ROW LEVEL SECURITY が付いているか確かめ、欠けていれば例外で止める
- pg のリポジトリは `@sandbox/shared` の `queryOne` `queryAll` `queryRequired` に zod の行スキーマを渡し、`.transform` でドメインの型に写す

### 禁止パターン

| パターン | 理由 |
| --- | --- |
| `GET /v1/tenants/:tenantId/end-users` の tenantId で認可 | 仕様書16章。Tenant ID 改ざん |
| `X-Tenant-Id` ヘッダで認可 | 同上 |
| `WHERE id = :id` のみでの単一取得 | IDOR / BOLA |
| Token の role claim で認可 | 役割の変更が反映されない |
| Token に permissions claim を載せて認可 | 権限変更が Token 寿命まで反映されない。Auth Server がサービスの語彙を持つことになる |
| API から Identity DB を参照 | サービスの境界が DB の境界と一致しなくなる。「入れるか」は Auth Server が Token 発行時に判定済み |
| 管理ロールでの RLS バイパス | 二重防御が無効化される |
| 全サービス共通の aud | CRM の Token で CMS の API が呼べてしまう |

## 共通ルート。管理アカウント

`packages/api-core/src/interface/http/routes/members.ts` が入力検証と契約への写し、`application/members.ts` がユースケース。どのサービスにも付く。招待と削除は Auth Server の管理 API で「入れるか」を変え、役割と上書きは自 DB に持つ。

| エンドポイント | 要求 permission | 内容 |
| --- | --- | --- |
| `GET /v1/members` | members:read | 一覧。`{members: [{user_id, email, name, role, status}]}` |
| `GET /v1/members/:userId` | members:read | 1 人。`{member, overrides, permissions}`。permissions は確定した集合のソート済み配列 |
| `POST /v1/members` | members:invite | `{email, name?, role}`。role は `ServiceDefinition.roles` のいずれか。`AuthAdminClient.invite` で Auth Server に登録してから、返った user_id で members を upsert。201 で `{member, linked}` |
| `PATCH /v1/members/:userId` | members:manage | `{role}`。members の role を更新 |
| `PUT /v1/members/:userId/permissions` | members:manage | `{overrides: [{permission, effect}]}`。最大 50 件。全行を置き換え、`{overrides, permissions}` を返す |
| `DELETE /v1/members/:userId` | members:manage | `AuthAdminClient.revoke` で Auth Server の割り当てを消してから members を削除。204。自分自身は 400 `cannot_remove_self` |

Auth Server の応答の写像。`tenant_not_found` と `not_contracted` は 403、`user_not_found` は 404 `not_found`、通信失敗や不明な応答は 503 `temporarily_unavailable`。削除時の `user_not_found` は無視して自 DB の行を消す。

### AuthAdminClient

`packages/api-core/src/application/ports/auth-admin.ts` の port と `infrastructure/auth-admin-client.ts` の `HttpAuthAdminClient`。`AUTH_BACKCHANNEL_URL` の `/admin/service-members` を `Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)` で呼ぶ。5 秒でタイムアウトする。テストは `MemoryAuthAdminClient` を注入する。

```typescript
interface AuthAdminClient {
  invite(input: {tenantId, email, name}): Promise<Result<InvitedUser, AuthAdminError>>;  // InvitedUser: userId, email, name, linked
  revoke(input: {tenantId, userId}): Promise<Result<void, AuthAdminError>>;
}
```

Auth Server 側は Client 認証で呼び出し元のサービスを特定し、そのサービスへの割り当てだけを操作させる。tenant_id は API が Token から取った値をそのまま渡すため、別テナントへの招待にはならない。

## サービス固有の API

### CRM。エンドユーザー

`apps/crm-api/src/end-users/`。ログインする人ではなく CRM が管理する顧客データ。

| エンドポイント | 要求 permission | 内容 |
| --- | --- | --- |
| `GET /v1/end-users` | end_users:read | 一覧。`{end_users: [...], masked}` |
| `GET /v1/end-users/:id` | end_users:read | 1 件。他テナントの id は 404 |
| `POST /v1/end-users` | end_users:create | `{name, email, phone, note?}`。201 |
| `PATCH /v1/end-users/:id` | end_users:update | 部分更新 |
| `DELETE /v1/end-users/:id` | end_users:delete | 204 |

マスキングの規則。呼び出し元の permissions に `end_users:unmask` がなければ、email は先頭 1 文字とドメインだけ残して `a***@example.com`、phone は数字の末尾 4 桁だけ残して `***-****-1234` にする。各行と一覧の応答に `masked` を付け、画面が「一部を隠している」と示せるようにする。作成や更新の応答も同じ規則で返すため、unmask のない人は自分が送った値もマスクされて戻る。

### CMS。投稿

`apps/cms-api/src/posts/`。

| エンドポイント | 要求 permission | 内容 |
| --- | --- | --- |
| `GET /v1/posts` | posts:read | 一覧。作成日時の降順 |
| `GET /v1/posts/:id` | posts:read | 1 件 |
| `POST /v1/posts` | posts:create | `{title, body}`。author_id は Token の sub。201 |
| `PATCH /v1/posts/:id` | posts:update | 部分更新 |
| `DELETE /v1/posts/:id` | posts:delete | 204 |

## テナント切替

1 Access Token は 1 テナント、1 サービスに限定する。alice が suzuki を操作するには suzuki.crm.sandbox.com で別の Tenant Session と Token を持つ。同じ tanaka でも CMS を操作するには tanaka.cms.sandbox.com で cms 向けの Token を持つ。API Server 側にテナント切替 API は作らない。

## 複数テナントをまたぐ管理 API。フェーズ2

複数テナントをまたぐ操作は、tenant_id を持たない管理用 Client の Access Token と `admin` scope を要求する。処理順序は同じだが、2 の member 判定の代わりに管理者テーブルを参照する。RLS は `app.tenant_id` を操作対象テナントに設定して1テナントずつ処理する。Auth Server の `/admin/service-members` はこれとは別で、サービス自身が自分の割り当てを操作するための Back Channel。

## API 変更案

グリーンフィールドのため新規規約として定義する。既存 API がある適用先では以下を移行対象にする。

| 変更 | 内容 |
| --- | --- |
| 認証 | Cognito JWT の直接検証を廃止し、Auth Server JWKS による検証へ置換 |
| aud | サービスごとの API origin を aud とし、Host から導いた値と照合 |
| パス | tenant slug / id を含むパスを廃止。Token の tenant_id に統一 |
| ミドルウェア | Authentication → 自 DB の member → Permission の順に必ず通す共通チェーンを導入 |
| Repository | tenant_id 必須引数化 |
| DB | 自サービスの DB に members と permission_overrides を追加。RLS ポリシー追加。実行時ロールの権限縮小と所有者の分離 |
| 役割 | `ServiceDefinition` で語彙を宣言し、Identity DB や Token から役割を取る箇所を自 DB の members に置き換える |
| 招待 | 招待の入口を `POST /v1/members` にし、Auth Server の管理 API を client_secret_basic で呼ぶ |
| CORS | ブラウザ直接呼び出しを廃止するため許可オリジンを空にする |

## ログ

- 認可判定の結果を user_id / tenant_id / permission / 結果 で構造化ログに出す
- 招待と削除は client_id / tenant_id / user_id を Auth Server とサービスの両方で記録する
- Token 値、Cookie 値、client_secret は出さない
- 403 の発生をテナント単位で監視し、異常な増加を IDOR 試行として検知する
