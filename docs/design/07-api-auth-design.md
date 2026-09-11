# API認証・認可・Tenant Isolation設計

## 結論

API Server は Resource Server として Auth Server 発行の Access Token のみを受け付ける。
API はサービスごとに `api.<service>.sandbox.com` のホストを持ち、受け付ける aud はリクエストの Host から導く。CRM の Token は api.cms では通らない。
テナントコンテキストは Token の `tenant_id` だけから決め、リクエストのパス・クエリ・ボディに含まれるテナント指定は認可根拠にしない。
認可は毎リクエスト Identity DB の tenant_members を再検証し、データアクセスは tenant_id でアプリ層とDB層の二重で分離する。

## 処理順序

仕様書17章の順序をミドルウェア構成に対応させる。

```mermaid
flowchart TD
    A["Request"] --> A0["0. Host → aud<br/>API_BASE_URL のホストと一致する Host か"]
    A0 -- 未知の Host --> E0["404 not_found"]
    A0 --> B["1. Authentication<br/>Bearer Token 抽出と JWT 検証<br/>aud が Host 由来の値と一致"]
    B -- 失敗 --> E1["401 unauthorized"]
    B --> C["2. User Identity<br/>sub → users.id、status=active"]
    C -- 無効 --> E1
    C --> D["3. Tenant Membership<br/>(tenant_id, user_id) を tenant_members で検索"]
    D -- なし / status!=active --> E2["403 forbidden"]
    D --> F["4. Role / Permission<br/>role → permission set"]
    F --> G["5. Authorization<br/>endpoint が要求する permission を確認"]
    G -- 不足 --> E2
    G --> H["6. Data Access<br/>tenant_id を Repository と RLS に強制"]
    H --> I["Response"]
```

0 から 3 までは `packages/api-core/src/usecases/resolve-tenant-context.ts` の `resolveTenantContext` が担う。Host 確認 → Bearer 抽出 → Access Token 検証 → `IdentityReader.findAccessContext(userId, tenantId)` で user / tenant / membership を 1 回の JOIN で取得 → user → tenant → membership の順に判定 → `TenantContext` を返す。ミドルウェア `auth/middleware.ts` はその Result を HTTP ステータスと `WWW-Authenticate` に写像するだけで、判定ロジックを持たない。

処理順序の前に全ルート共通のミドルウェアを通す。body は Hono の `bodyLimit` で 16 KB に制限し、業務 API の JSON はこの範囲で足りる。応答には `Cache-Control: no-store` を付ける。`/healthz` は Host 確認と Token 検証の前に返す。

## 0. Host → aud

API はサービスごとに別プロセスで、1 プロセスは 1 つの Host だけを受ける。環境変数 `API_BASE_URL` の値をそのまま aud とし、リクエストの Host が `API_BASE_URL` のホストと一致することを要求する。`ApiAppOptions.audience` は文字列 1 つで、Host から aud を引く表は持たない。
環境変数は `packages/api-core/src/config.ts` の `loadApiCoreConfig` が `parseEnv` で検証する。`PORT` `API_BASE_URL` `ISSUER` `AUTH_BACKCHANNEL_URL` `DATABASE_URL` のみで、`PUBLIC_SCHEME` は持たない。

| プロセス | API_BASE_URL | aud | 受け付ける Host |
| --- | --- | --- | --- |
| crm-api | http://api.crm.localhost:3002 | http://api.crm.localhost:3002 | api.crm.localhost:3002 |
| cms-api | http://api.cms.localhost:3004 | http://api.cms.localhost:3004 | api.cms.localhost:3004 |
| それ以外の Host | | | 404 not_found。Token 検証に進まない |

aud は oidc_clients.audience と完全一致させる。provision は `SERVICES[].apiBaseUrl` を oidc_clients.audience に書くため、同じ値を `API_BASE_URL` に与えれば一致する。crm-api に届いた cms 向けの Token は aud 不一致で 401 になる。

## 1. Authentication

| 検証項目 | 内容 |
| --- | --- |
| ヘッダ | `Authorization: Bearer <jwt>`。Cookie は受け付けない |
| 署名 | Auth Server の JWKS。RS256 のみ。kid で鍵選択 |
| iss | `https://auth.sandbox.com` |
| aud | `API_BASE_URL` が aud に含まれること。CRM の Token を api.cms に送ると 401。ID Token を誤って送られても拒否 |
| exp / iat | 許容スキュー 30秒 |
| 必須 claims | sub, tenant_id, sid, client_id。sid と client_id は Auth Server 発行の Access Token であることの確認に使い、ハンドラへ渡すのは sub と tenant_id だけ |

失敗時は `401` と `WWW-Authenticate: Bearer error="invalid_token"` を返す。期限切れは `error_description="expired"` を付け、Tenant Web Application が Refresh を判断できるようにする。この文字列は `packages/shared/src/oidc-protocol.ts` の `TOKEN_EXPIRED_DESCRIPTION` で両者が共有する。

## 2. User Identity

- `sub` を users.id として扱う
- users.status が active でなければ 401
- ユーザー参照はリクエスト単位でキャッシュしない。ユーザー無効化を即時反映するため

## 3. Tenant Membership

2 と 3 は 1 回のクエリで引く。`findAccessContext` は sub と tenant_id を起点に users / tenants / tenant_members を LEFT JOIN し、存在しない行は undefined として返す。

```sql
SELECT u.id, u.email, u.name, u.status AS user_status,
       t.id, t.slug, t.status AS tenant_status,
       m.role, m.status AS membership_status
  FROM (SELECT :token_sub AS user_id, :token_tenant_id AS tenant_id) p
  LEFT JOIN users u ON u.id = p.user_id
  LEFT JOIN tenants t ON t.id = p.tenant_id
  LEFT JOIN tenant_members m ON m.user_id = p.user_id AND m.tenant_id = p.tenant_id;
```

- user が存在しないか active でなければ 401。tenant が存在しないか active でなければ 403
- membership が見つからないか active でなければ 403
- Token の tenant_id は Auth Server が発行時に契約と Membership を検証済みだが、発行後の Membership 削除を反映するため毎回再検証する
- 契約 tenant_services は API では再検証しない。契約解除は Refresh 時に Auth Server が拒否し、最大 15 分で Token が失効する
- 短時間キャッシュを入れる場合は Access Token 寿命以下にする。推奨は 60 秒以内

## 4. Role / Permission

role は tenant_members から取得した値のみ使う。Token に role があっても無視する。

| role | permissions |
| --- | --- |
| owner | すべて。tenant:delete を含む |
| admin | tenant:read, tenant:update, members:*, projects:* |
| member | tenant:read, projects:read, projects:write |
| viewer | tenant:read, projects:read |

permission の定義は API Server 内の単一の表で管理し、DB には role のみ保存する。判断事項D8。

## 5. Authorization

各エンドポイントは要求 permission を宣言する。

```typescript
app.get('/v1/projects', requirePermission('projects:read'), handler);
app.post('/v1/projects', requirePermission('projects:write'), handler);
app.delete('/v1/projects/:id', requirePermission('projects:write'), handler);
```

- permission 未宣言のエンドポイントは起動時にエラーにする。デフォルト拒否
- オブジェクト単位の所有者チェックが必要な場合は handler 内で追加し、tenant_id 一致の後に評価する

## 6. Data Access と Tenant Isolation

### アプリ層

- Repository は tenant_id を必須引数に取る。省略可能な引数にしない
- tenant_id はリクエストコンテキストの Token 由来値のみ。ハンドラがリクエストパラメータから tenant_id を組み立てることを禁止する
- 単一リソース取得は `WHERE id = :id AND tenant_id = :tenant_id`。見つからなければ 404。他テナントのIDを指定しても存在の有無を区別しない
- 一括更新・削除も必ず tenant_id 条件を含める

```typescript
type TenantContext = { tenantId: string; userId: string; role: Role };

class ProjectRepository {
  findById(ctx: TenantContext, id: string) {
    return db.query('SELECT * FROM projects WHERE id = $1 AND tenant_id = $2', [id, ctx.tenantId]);
  }
}
```

### DB層。PostgreSQL の場合

判断事項D11。アプリ層のバグに対する二重防御として Row Level Security を使う。

```sql
BEGIN;
SET LOCAL app.tenant_id = '<token_tenant_id>';
-- 以降のクエリは RLS により tenant_id が一致する行のみ見える
COMMIT;
```

- API Server の DB ロールは BYPASSRLS を持たない
- `FORCE ROW LEVEL SECURITY` でテーブル所有者にも適用する
- マイグレーション用ロールと実行時ロールを分ける

### 禁止パターン

| パターン | 理由 |
| --- | --- |
| `GET /v1/tenants/:tenantId/projects` の tenantId で認可 | 仕様書16章。Tenant ID 改ざん |
| `X-Tenant-Id` ヘッダで認可 | 同上 |
| `WHERE id = :id` のみでの単一取得 | IDOR / BOLA |
| Token の role claim で認可 | Membership 変更が反映されない |
| 管理ロールでの RLS バイパス | 二重防御が無効化される |
| 全サービス共通の aud | CRM の Token で CMS の API が呼べてしまう |

## テナント切替

1 Access Token は 1 テナント、1 サービスに限定する。alice が suzuki を操作するには suzuki.crm.sandbox.com で別の Tenant Session と Token を持つ。同じ tanaka でも CMS を操作するには tanaka.cms.sandbox.com で cms 向けの Token を持つ。API Server 側にテナント切替 API は作らない。

## 管理 API。フェーズ2

複数テナントをまたぐ操作は、tenant_id を持たない管理用 Client の Access Token と `admin` scope を要求する。処理順序は同じだが、3の Membership 判定の代わりに管理者テーブルを参照する。RLS は `app.tenant_id` を操作対象テナントに設定して1テナントずつ処理する。

## API 変更案

グリーンフィールドのため新規規約として定義する。既存 API がある適用先では以下を移行対象にする。

| 変更 | 内容 |
| --- | --- |
| 認証 | Cognito JWT の直接検証を廃止し、Auth Server JWKS による検証へ置換 |
| aud | サービスごとの API origin を aud とし、Host から導いた値と照合 |
| パス | tenant slug / id を含むパスを廃止。Token の tenant_id に統一 |
| ミドルウェア | Authentication → Membership → Permission の順に必ず通す共通チェーンを導入 |
| Repository | tenant_id 必須引数化 |
| DB | RLS ポリシー追加。実行時ロールの権限縮小 |
| CORS | ブラウザ直接呼び出しを廃止するため許可オリジンを空にする |

## ログ

- 認可判定の結果を user_id / tenant_id / permission / 結果 で構造化ログに出す
- Token 値、Cookie 値、client_secret は出さない
- 403 の発生をテナント単位で監視し、異常な増加を IDOR 試行として検知する
