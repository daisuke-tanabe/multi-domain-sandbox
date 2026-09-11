-- CMS サービスの DB ロール。ローカル専用の固定パスワード
-- RDS では tools/provision が Secrets Manager の値でこのロールを作るため、このファイルは使わない
-- cms_app は所有者ではなく利用者。FORCE ROW LEVEL SECURITY が所有者に効かないため、テーブルは postgres が所有する
CREATE ROLE cms_app LOGIN PASSWORD 'cms_app' NOBYPASSRLS;
