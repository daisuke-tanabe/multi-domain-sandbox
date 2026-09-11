-- ローカル検証用シード
-- モック Cognito のユーザーと cognito_sub を一致させる。apps/auth-api/.env.example を参照
--
-- サービス : crm, cms
-- テナント : tanaka (crm と cms を契約), suzuki (crm のみ契約)
-- alice    : tanaka の owner、suzuki の viewer
-- bob      : suzuki の admin のみ
-- carol    : どのテナントにも所属しない
--
-- client_secret はローカル固定値。ハッシュは packages/shared/src/secret-hash.ts の scrypt 形式
--   crm : crm-secret
--   cms : cms-secret

SET ROLE sandbox_auth;

INSERT INTO identity.users (id, cognito_sub, email, name) VALUES
  ('01J0000000000000000000ALICE', 'cognito-sub-alice', 'alice@example.com', 'Alice'),
  ('01J00000000000000000000BOB0', 'cognito-sub-bob',   'bob@example.com',   'Bob');

INSERT INTO identity.tenants (id, slug, name) VALUES
  ('01J00000000000000000TANAKA0', 'tanaka', 'Tanaka Inc.'),
  ('01J00000000000000000SUZUKI0', 'suzuki', 'Suzuki Ltd.');

INSERT INTO identity.tenant_members (tenant_id, user_id, role) VALUES
  ('01J00000000000000000TANAKA0', '01J0000000000000000000ALICE', 'owner'),
  ('01J00000000000000000SUZUKI0', '01J0000000000000000000ALICE', 'viewer'),
  ('01J00000000000000000SUZUKI0', '01J00000000000000000000BOB0', 'admin');

INSERT INTO identity.oidc_clients (client_id, client_secret_hash, name, audience, backchannel_logout_uri) VALUES
  ('crm', 'scrypt$c2FuZGJveC1maXhlZC1zYWx0$s13D4d-MMXU9mEfZd2OWnNLfpqUnrGEZnWwtO1wAxTg', 'CRM', 'http://api.crm.localhost:3002', 'http://crm.localhost:3001/auth/backchannel-logout'),
  ('cms', 'scrypt$c2FuZGJveC1maXhlZC1zYWx0$R2io-GheJszjo_f1mrYAMPWACmY2sbFLGdvcJH1kS98', 'CMS', 'http://api.cms.localhost:3004', 'http://cms.localhost:3003/auth/backchannel-logout');

-- 戻り先はテナント × サービスごとに登録する。suzuki.cms は登録するが契約がないため access_denied になる
INSERT INTO identity.oidc_client_redirect_uris (client_id, redirect_uri, tenant_id) VALUES
  ('crm', 'http://tanaka.crm.localhost:3001/auth/callback', '01J00000000000000000TANAKA0'),
  ('crm', 'http://suzuki.crm.localhost:3001/auth/callback', '01J00000000000000000SUZUKI0'),
  ('cms', 'http://tanaka.cms.localhost:3003/auth/callback', '01J00000000000000000TANAKA0'),
  ('cms', 'http://suzuki.cms.localhost:3003/auth/callback', '01J00000000000000000SUZUKI0');

INSERT INTO identity.tenant_services (tenant_id, client_id) VALUES
  ('01J00000000000000000TANAKA0', 'crm'),
  ('01J00000000000000000TANAKA0', 'cms'),
  ('01J00000000000000000SUZUKI0', 'crm');

RESET ROLE;

-- business.projects は FORCE ROW LEVEL SECURITY のため sandbox_api では app.tenant_id なしに挿入できない
-- シードは RLS をバイパスできるスーパーユーザーのまま投入する
INSERT INTO business.projects (id, tenant_id, name, created_by) VALUES
  ('01J0000000000000000PROJECTT1', '01J00000000000000000TANAKA0', 'Tanaka Project 1', '01J0000000000000000000ALICE'),
  ('01J0000000000000000PROJECTT2', '01J00000000000000000TANAKA0', 'Tanaka Project 2', '01J0000000000000000000ALICE'),
  ('01J0000000000000000PROJECTS1', '01J00000000000000000SUZUKI0', 'Suzuki Project 1', '01J00000000000000000000BOB0');
