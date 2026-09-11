-- ローカル検証用シード
-- モック Cognito のユーザーと cognito_sub を一致させる。apps/auth-api/.env.example を参照
--
-- サービス : crm, cms
-- テナント : tanaka (crm と cms を契約), suzuki (crm のみ契約)
-- alice    : tanaka の crm / cms、suzuki の crm に入れる
-- bob      : suzuki の crm に入れる
-- carol    : どのサービスにも入れない。モック Cognito には存在する
-- dave     : identity に存在しない。サービスの画面から招待して初回ログインで紐付ける確認用
-- 役割はサービス側の DB (db/crm, db/cms) が持つ
--
-- client_secret はローカル固定値。ハッシュは packages/shared/src/secret-hash.ts の sha256 形式
--   crm : crm-v3R_5OBDCC6k8EeDKB6l5YltYVTSeJQZxpU-2-PE7VU
--   cms : cms-D-t4BfncXGWLx6FnGD0DW1gJroNFYm1GDm8QSgOYNLA

SET ROLE sandbox_auth;

INSERT INTO identity.users (id, cognito_sub, email, name) VALUES
  ('01J0000000000000000000ALICE', 'cognito-sub-alice', 'alice@example.com', 'Alice'),
  ('01J00000000000000000000BOB0', 'cognito-sub-bob',   'bob@example.com',   'Bob');

INSERT INTO identity.tenants (id, slug, name) VALUES
  ('01J00000000000000000TANAKA0', 'tanaka', 'Tanaka Inc.'),
  ('01J00000000000000000SUZUKI0', 'suzuki', 'Suzuki Ltd.');

-- 会社横断の役割
INSERT INTO identity.tenant_members (tenant_id, user_id, role) VALUES
  ('01J00000000000000000TANAKA0', '01J0000000000000000000ALICE', 'owner'),
  ('01J00000000000000000SUZUKI0', '01J00000000000000000000BOB0', 'owner');

INSERT INTO identity.oidc_clients (id, client_id, name, audience, redirect_uri_template, backchannel_logout_uri) VALUES
  ('01J00000000000000000000CRM', 'crm', 'CRM', 'http://api.crm.localhost:3002', 'http://{tenant}.crm.localhost:3001/auth/callback', 'http://crm.localhost:3001/auth/backchannel-logout'),
  ('01J00000000000000000000CMS', 'cms', 'CMS', 'http://api.cms.localhost:3004', 'http://{tenant}.cms.localhost:3003/auth/callback', 'http://cms.localhost:3003/auth/backchannel-logout');

INSERT INTO identity.oidc_client_secrets (id, oidc_client_id, secret_hash) VALUES
  ('01J0000000000000000CRMSEC1', '01J00000000000000000000CRM', 'sha256$kkx39qkJVz2YbZgRDEK6Be78zfE1Z1dR9r9Nc06ZWqw'),
  ('01J0000000000000000CMSSEC1', '01J00000000000000000000CMS', 'sha256$3Y9I_ZB9Y8jOR0nhE25ZUXAshoh6AHnDI7WaxWDpF_I');

-- suzuki は cms を契約していない。suzuki.cms への認可は access_denied (not_contracted) になる
INSERT INTO identity.tenant_services (tenant_id, oidc_client_id) VALUES
  ('01J00000000000000000TANAKA0', '01J00000000000000000000CRM'),
  ('01J00000000000000000TANAKA0', '01J00000000000000000000CMS'),
  ('01J00000000000000000SUZUKI0', '01J00000000000000000000CRM');

-- サービスに入れる人
INSERT INTO identity.tenant_service_members (tenant_id, oidc_client_id, user_id) VALUES
  ('01J00000000000000000TANAKA0', '01J00000000000000000000CRM', '01J0000000000000000000ALICE'),
  ('01J00000000000000000TANAKA0', '01J00000000000000000000CMS', '01J0000000000000000000ALICE'),
  ('01J00000000000000000SUZUKI0', '01J00000000000000000000CRM', '01J0000000000000000000ALICE'),
  ('01J00000000000000000SUZUKI0', '01J00000000000000000000CRM', '01J00000000000000000000BOB0');

RESET ROLE;
