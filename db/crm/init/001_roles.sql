-- CRM サービスの DB ロール。ローカル専用の固定パスワード
-- RDS では tools/provision が Secrets Manager の値でこのロールを作るため、このファイルは使わない
-- crm_app は所有者ではなく利用者。FORCE ROW LEVEL SECURITY が所有者に効かないため、テーブルは postgres が所有する
CREATE ROLE crm_app LOGIN PASSWORD 'crm_app' NOBYPASSRLS;
