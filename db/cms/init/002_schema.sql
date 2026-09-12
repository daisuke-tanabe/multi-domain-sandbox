-- CMS サービスの DB。cms-api だけが接続する
-- 役割と権限はここで持つ。identity DB には接続しない
--
-- ロール cms_app は所有者ではなく利用者。FORCE ROW LEVEL SECURITY が所有者に効かないため、
-- テーブルは postgres が所有し、cms_app には必要な権限だけ与える

CREATE SCHEMA cms;
GRANT USAGE ON SCHEMA cms TO cms_app;

CREATE FUNCTION cms.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

-- 管理アカウント。CMS の役割は owner / editor / viewer。CRM とは語彙が違う
CREATE TABLE cms.members (
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  email       TEXT,
  name        TEXT,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE TRIGGER members_touch_updated_at BEFORE UPDATE ON cms.members
  FOR EACH ROW EXECUTE FUNCTION cms.touch_updated_at();

CREATE TABLE cms.permission_overrides (
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  permission  TEXT NOT NULL,
  effect      TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, permission),
  FOREIGN KEY (tenant_id, user_id) REFERENCES cms.members (tenant_id, user_id) ON DELETE CASCADE
);

CREATE TABLE cms.posts (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  author_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX posts_tenant_id_idx ON cms.posts (tenant_id, created_at DESC);
CREATE TRIGGER posts_touch_updated_at BEFORE UPDATE ON cms.posts
  FOR EACH ROW EXECUTE FUNCTION cms.touch_updated_at();

-- すべてのテーブルを tenant_id で分離する。app.tenant_id 未設定時は NULL を返し、どの行にも一致しない
CREATE FUNCTION cms.current_tenant_id() RETURNS TEXT
  LANGUAGE sql STABLE PARALLEL SAFE
  RETURN current_setting('app.tenant_id', true);

ALTER TABLE cms.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.members FORCE ROW LEVEL SECURITY;
CREATE POLICY members_tenant_isolation ON cms.members
  USING (tenant_id = cms.current_tenant_id())
  WITH CHECK (tenant_id = cms.current_tenant_id());

ALTER TABLE cms.permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.permission_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY permission_overrides_tenant_isolation ON cms.permission_overrides
  USING (tenant_id = cms.current_tenant_id())
  WITH CHECK (tenant_id = cms.current_tenant_id());

ALTER TABLE cms.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms.posts FORCE ROW LEVEL SECURITY;
CREATE POLICY posts_tenant_isolation ON cms.posts
  USING (tenant_id = cms.current_tenant_id())
  WITH CHECK (tenant_id = cms.current_tenant_id());

-- 新しいテーブルを足したときに FORCE ROW LEVEL SECURITY を忘れていないか、init の最後で確かめる
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'cms' AND c.relkind = 'r' AND NOT c.relforcerowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'tables without FORCE ROW LEVEL SECURITY: %', missing;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON cms.members, cms.permission_overrides, cms.posts TO cms_app;
