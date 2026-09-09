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

RESET ROLE;
