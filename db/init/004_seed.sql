-- ローカル検証用シード
-- モック Cognito のユーザーと cognito_sub を一致させる。apps/auth-server/.env.example を参照
--
-- alice : tenant-a の owner、tenant-b の viewer
-- bob   : tenant-b の admin のみ。tenant-a には所属しない
--
-- client_secret はローカル固定値。ハッシュは packages/shared/src/secret-hash.ts の scrypt 形式
--   tenant-a : tenant-a-secret
--   tenant-b : tenant-b-secret

SET ROLE sandbox_auth;

INSERT INTO identity.users (id, cognito_sub, email, name) VALUES
  ('01J0000000000000000000ALICE', 'cognito-sub-alice', 'alice@example.com', 'Alice'),
  ('01J00000000000000000000BOB0', 'cognito-sub-bob',   'bob@example.com',   'Bob');

INSERT INTO identity.tenants (id, slug, name) VALUES
  ('01J000000000000000000TENANTA', 'tenant-a', 'Tenant A'),
  ('01J000000000000000000TENANTB', 'tenant-b', 'Tenant B');

INSERT INTO identity.tenant_members (tenant_id, user_id, role) VALUES
  ('01J000000000000000000TENANTA', '01J0000000000000000000ALICE', 'owner'),
  ('01J000000000000000000TENANTB', '01J0000000000000000000ALICE', 'viewer'),
  ('01J000000000000000000TENANTB', '01J00000000000000000000BOB0', 'admin');

INSERT INTO identity.oidc_clients (client_id, client_secret_hash, tenant_id, name, backchannel_logout_uri) VALUES
  ('tenant-a', 'scrypt$c2FuZGJveC1maXhlZC1zYWx0$Pvz0VCCwCJsdOhrBdi5Jol1xeVozYXQkQbbslt-kdGI', '01J000000000000000000TENANTA', 'Tenant A Web', 'http://tenant-a.localhost:3001/auth/backchannel-logout'),
  ('tenant-b', 'scrypt$c2FuZGJveC1maXhlZC1zYWx0$Oe2ZFdkXWxblOAdpPWl5zhmqvzZIEHA3IAA6e19seA4', '01J000000000000000000TENANTB', 'Tenant B Web', 'http://tenant-b.localhost:3001/auth/backchannel-logout');

INSERT INTO identity.oidc_client_redirect_uris (client_id, redirect_uri) VALUES
  ('tenant-a', 'http://tenant-a.localhost:3001/auth/callback'),
  ('tenant-b', 'http://tenant-b.localhost:3001/auth/callback');

RESET ROLE;

-- business.projects は FORCE ROW LEVEL SECURITY のため sandbox_api では app.tenant_id なしに挿入できない
-- シードは RLS をバイパスできるスーパーユーザーのまま投入する
INSERT INTO business.projects (id, tenant_id, name, created_by) VALUES
  ('01J0000000000000000PROJECTA1', '01J000000000000000000TENANTA', 'Tenant A Project 1', '01J0000000000000000000ALICE'),
  ('01J0000000000000000PROJECTA2', '01J000000000000000000TENANTA', 'Tenant A Project 2', '01J0000000000000000000ALICE'),
  ('01J0000000000000000PROJECTB1', '01J000000000000000000TENANTB', 'Tenant B Project 1', '01J00000000000000000000BOB0');
