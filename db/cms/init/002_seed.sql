-- CMS のローカルシード。identity の user_id と一致させる
--   alice : tanaka では owner。ただし posts:create を deny にしてあり、投稿は読めるが作れない
-- suzuki は cms を契約していないので行がない

INSERT INTO cms.members (tenant_id, user_id, email, name, role) VALUES
  ('01J00000000000000000TANAKA0', '01J0000000000000000000ALICE', 'alice@example.com', 'Alice', 'owner');

INSERT INTO cms.permission_overrides (tenant_id, user_id, permission, effect) VALUES
  ('01J00000000000000000TANAKA0', '01J0000000000000000000ALICE', 'posts:create', 'deny');

INSERT INTO cms.posts (id, tenant_id, title, body, author_id) VALUES
  ('01J00000000000000000POST001', '01J00000000000000000TANAKA0', 'はじめての投稿', 'CMS の動作確認用の本文です。', '01J0000000000000000000ALICE'),
  ('01J00000000000000000POST002', '01J00000000000000000TANAKA0', 'お知らせ', '来週のメンテナンス予定について。', '01J0000000000000000000ALICE');
