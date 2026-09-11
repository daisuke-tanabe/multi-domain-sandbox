-- Business スキーマ。所有者は sandbox_api
-- すべての業務テーブルは tenant_id を持ち、RLS で分離する
-- docs/design/07-api-auth-design.md に対応する

SET ROLE sandbox_api;

CREATE TABLE business.projects (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX projects_tenant_id_idx ON business.projects (tenant_id);

ALTER TABLE business.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.projects FORCE ROW LEVEL SECURITY;

-- app.tenant_id 未設定時は current_setting が NULL を返し、どの行にも一致しない
CREATE POLICY projects_tenant_isolation ON business.projects
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- サービス固有の細かい権限。役割から導く既定の権限に対して個別に許可 / 拒否を上書きする
-- Token には載せず、API がリクエストごとに読む。サンドボックスでは 1 つの DB を複数サービスで共有するため client_id で分ける
CREATE TABLE business.member_permissions (
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  client_id   TEXT NOT NULL,
  permission  TEXT NOT NULL,
  effect      TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, client_id, permission)
);

ALTER TABLE business.member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.member_permissions FORCE ROW LEVEL SECURITY;

CREATE POLICY member_permissions_tenant_isolation ON business.member_permissions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

RESET ROLE;
