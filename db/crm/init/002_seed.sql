-- CRM のローカルシード。identity の user_id と一致させる
--   alice : tanaka では owner、suzuki では viewer
--   bob   : suzuki では admin
-- 役割の既定: owner と admin はマスク解除可、member と viewer はマスク表示
-- 上書き: suzuki の alice に end_users:unmask を allow。viewer でも解除できる例

INSERT INTO crm.members (tenant_id, user_id, email, name, role) VALUES
  ('01J00000000000000000TANAKA0', '01J0000000000000000000ALICE', 'alice@example.com', 'Alice', 'owner'),
  ('01J00000000000000000SUZUKI0', '01J0000000000000000000ALICE', 'alice@example.com', 'Alice', 'viewer'),
  ('01J00000000000000000SUZUKI0', '01J00000000000000000000BOB0', 'bob@example.com',   'Bob',   'admin');

INSERT INTO crm.permission_overrides (tenant_id, user_id, permission, effect) VALUES
  ('01J00000000000000000SUZUKI0', '01J0000000000000000000ALICE', 'end_users:unmask', 'allow');

INSERT INTO crm.end_users (id, tenant_id, name, email, phone, note) VALUES
  ('01J000000000000000000EU0001', '01J00000000000000000TANAKA0', '山田 太郎', 'taro.yamada@example.com', '090-1111-2222', '優良顧客'),
  ('01J000000000000000000EU0002', '01J00000000000000000TANAKA0', '佐藤 花子', 'hanako.sato@example.com', '080-3333-4444', ''),
  ('01J000000000000000000EU0003', '01J00000000000000000TANAKA0', '高橋 一郎', 'ichiro.takahashi@example.com', '070-5555-6666', '休眠'),
  ('01J000000000000000000EU0101', '01J00000000000000000SUZUKI0', '鈴木 次郎', 'jiro.suzuki@example.com', '090-7777-8888', ''),
  ('01J000000000000000000EU0102', '01J00000000000000000SUZUKI0', '伊藤 美咲', 'misaki.ito@example.com', '080-9999-0000', '要フォロー');
