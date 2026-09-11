-- Identity スキーマ。所有者は sandbox_auth
-- docs/design/05-data-model.md に対応する
--
-- サービス (oidc_clients) とテナント (tenants) は別の軸。
-- テナントは顧客企業であり、複数のサービスを契約できる (tenant_services)。
-- 認可リクエストのテナントは redirect_uri をサービスのテンプレートに当てて slug を取り出し、tenants から引く。
-- identity が持つのは「誰がどのテナントのどのサービスに入れるか」(tenant_service_members) まで。
-- サービス内の役割と権限は各サービスの DB が持つ。tenant_members は会社横断の役割にだけ使う。
-- 主キーはすべてサロゲート ID。client_id や slug は外部に見せる識別子で、UNIQUE 制約で守る。

SET ROLE sandbox_auth;

CREATE FUNCTION identity.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

-- cognito_sub は招待直後は NULL。初回ログイン時にメールで照合して埋める
CREATE TABLE identity.users (
  id            TEXT PRIMARY KEY,
  cognito_sub   TEXT UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON identity.users
  FOR EACH ROW EXECUTE FUNCTION identity.touch_updated_at();

CREATE TABLE identity.tenants (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER tenants_touch_updated_at BEFORE UPDATE ON identity.tenants
  FOR EACH ROW EXECUTE FUNCTION identity.touch_updated_at();

-- 会社横断の役割。管理者や請求担当のような、サービスに依らない立場を表す。ログイン可否には使わない
CREATE TABLE identity.tenant_members (
  tenant_id     TEXT NOT NULL REFERENCES identity.tenants (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX tenant_members_user_id_idx ON identity.tenant_members (user_id);
CREATE TRIGGER tenant_members_touch_updated_at BEFORE UPDATE ON identity.tenant_members
  FOR EACH ROW EXECUTE FUNCTION identity.touch_updated_at();

-- サービスごとに 1 Client。client_id は OAuth の公開識別子で、内部参照は id を使う
-- redirect_uri_template は {tenant} を 1 か所だけ含む。展開後の完全一致で redirect_uri を検証する
CREATE TABLE identity.oidc_clients (
  id                     TEXT PRIMARY KEY,
  client_id              TEXT NOT NULL UNIQUE CHECK (client_id ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  name                   TEXT NOT NULL,
  audience               TEXT NOT NULL,
  redirect_uri_template  TEXT NOT NULL CHECK (redirect_uri_template LIKE '%{tenant}%'),
  allowed_scopes         TEXT[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
  backchannel_logout_uri TEXT,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER oidc_clients_touch_updated_at BEFORE UPDATE ON identity.oidc_clients
  FOR EACH ROW EXECUTE FUNCTION identity.touch_updated_at();

-- client_secret は複数持てる。ローテーション中は新旧を active にし、切替後に旧を revoked にする
CREATE TABLE identity.oidc_client_secrets (
  id              TEXT PRIMARY KEY,
  oidc_client_id  TEXT NOT NULL REFERENCES identity.oidc_clients (id) ON DELETE CASCADE,
  secret_hash     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);
CREATE INDEX oidc_client_secrets_active_idx ON identity.oidc_client_secrets (oidc_client_id)
  WHERE status = 'active';

-- 契約。テナントがそのサービスを利用できるか
CREATE TABLE identity.tenant_services (
  tenant_id       TEXT NOT NULL REFERENCES identity.tenants (id) ON DELETE CASCADE,
  oidc_client_id  TEXT NOT NULL REFERENCES identity.oidc_clients (id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, oidc_client_id)
);
CREATE INDEX tenant_services_oidc_client_id_idx ON identity.tenant_services (oidc_client_id);
CREATE TRIGGER tenant_services_touch_updated_at BEFORE UPDATE ON identity.tenant_services
  FOR EACH ROW EXECUTE FUNCTION identity.touch_updated_at();

-- サービスへの割り当て。招待はこの単位で行う。役割は持たず、サービス側の DB が持つ
CREATE TABLE identity.tenant_service_members (
  tenant_id       TEXT NOT NULL,
  oidc_client_id  TEXT NOT NULL,
  user_id         TEXT NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, oidc_client_id, user_id),
  -- 契約のないサービスに人を割り当てられない
  FOREIGN KEY (tenant_id, oidc_client_id)
    REFERENCES identity.tenant_services (tenant_id, oidc_client_id) ON DELETE CASCADE
);
CREATE INDEX tenant_service_members_user_id_idx ON identity.tenant_service_members (user_id);
CREATE TRIGGER tenant_service_members_touch_updated_at BEFORE UPDATE ON identity.tenant_service_members
  FOR EACH ROW EXECUTE FUNCTION identity.touch_updated_at();

RESET ROLE;
