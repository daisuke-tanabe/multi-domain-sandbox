-- ロール設計
--   sandbox_auth : Identity スキーマの所有者。auth-api が使う
--   sandbox_api  : Identity スキーマは SELECT のみ。business スキーマの読み書き。RLS をバイパスしない
-- ローカル検証用の固定パスワード。本番では Secret Store から注入する

CREATE ROLE sandbox_auth LOGIN PASSWORD 'sandbox_auth';
CREATE ROLE sandbox_api LOGIN PASSWORD 'sandbox_api' NOBYPASSRLS;

CREATE SCHEMA identity AUTHORIZATION sandbox_auth;
CREATE SCHEMA business AUTHORIZATION sandbox_api;

GRANT USAGE ON SCHEMA identity TO sandbox_api;
ALTER DEFAULT PRIVILEGES FOR ROLE sandbox_auth IN SCHEMA identity GRANT SELECT ON TABLES TO sandbox_api;
