-- CRM サービスの DB。crm-api だけが接続する
-- 役割と権限はここで持つ。identity DB には接続しない
--
-- ロール crm_app は所有者ではなく利用者。FORCE ROW LEVEL SECURITY が所有者に効かないため、
-- テーブルは postgres が所有し、crm_app には必要な権限だけ与える

CREATE SCHEMA crm;
GRANT USAGE ON SCHEMA crm TO crm_app;

CREATE FUNCTION crm.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

-- 管理アカウント。identity の user_id をキーに、このサービスでの役割を持つ
-- email と name は招待時に控えた表示用の写し。identity が正
CREATE TABLE crm.members (
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  email       TEXT,
  name        TEXT,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TRIGGER members_touch_updated_at BEFORE UPDATE ON crm.members
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- 役割の既定に対する個別の許可 / 拒否。deny が優先
CREATE TABLE crm.permission_overrides (
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  permission  TEXT NOT NULL,
  effect      TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, permission),
  FOREIGN KEY (tenant_id, user_id) REFERENCES crm.members (tenant_id, user_id) ON DELETE CASCADE
);

-- CRM が管理するエンドユーザー。ログインする人ではなく顧客データ
CREATE TABLE crm.end_users (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX end_users_tenant_id_idx ON crm.end_users (tenant_id, created_at);
CREATE TRIGGER end_users_touch_updated_at BEFORE UPDATE ON crm.end_users
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- すべてのテーブルを tenant_id で分離する。app.tenant_id 未設定時は current_setting が NULL を返し、どの行にも一致しない
ALTER TABLE crm.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.members FORCE ROW LEVEL SECURITY;
CREATE POLICY members_tenant_isolation ON crm.members
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE crm.permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.permission_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY permission_overrides_tenant_isolation ON crm.permission_overrides
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE crm.end_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.end_users FORCE ROW LEVEL SECURITY;
CREATE POLICY end_users_tenant_isolation ON crm.end_users
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.members, crm.permission_overrides, crm.end_users TO crm_app;
