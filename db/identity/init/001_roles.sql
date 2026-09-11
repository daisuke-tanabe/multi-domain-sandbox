-- identity DB のロール
--   sandbox_auth : identity スキーマの所有者。auth-api だけが使う
-- サービスの API はこの DB に接続しない。役割や権限は各サービスの DB が持つ
-- ローカル検証用の固定パスワード。本番では Secret Store から注入する

CREATE ROLE sandbox_auth LOGIN PASSWORD 'sandbox_auth';

CREATE SCHEMA identity AUTHORIZATION sandbox_auth;
