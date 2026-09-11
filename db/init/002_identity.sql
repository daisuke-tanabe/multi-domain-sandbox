-- Identity スキーマ。所有者は sandbox_auth
-- docs/design/05-data-model.md に対応する
--
-- サービス (oidc_clients) とテナント (tenants) は別の軸。
-- テナントは顧客企業であり、複数のサービスを契約できる (tenant_services)。
-- 認可リクエストのテナントは登録済み redirect_uri から決める (oidc_client_redirect_uris.tenant_id)。

SET ROLE sandbox_auth;

CREATE TABLE identity.users (
  id            TEXT PRIMARY KEY,
  cognito_sub   TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  name          TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.tenants (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.tenant_members (
  tenant_id     TEXT NOT NULL REFERENCES identity.tenants (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX tenant_members_user_id_idx ON identity.tenant_members (user_id);

-- サービスごとに 1 Client。audience はそのサービスの API の識別子
CREATE TABLE identity.oidc_clients (
  client_id              TEXT PRIMARY KEY,
  client_secret_hash     TEXT NOT NULL,
  name                   TEXT NOT NULL,
  audience               TEXT NOT NULL,
  allowed_scopes         TEXT[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
  backchannel_logout_uri TEXT,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- redirect_uri は完全一致で検証する。tenant_id が NULL の行はテナントに紐付かない戻り先
CREATE TABLE identity.oidc_client_redirect_uris (
  client_id     TEXT NOT NULL REFERENCES identity.oidc_clients (client_id) ON DELETE CASCADE,
  redirect_uri  TEXT NOT NULL,
  tenant_id     TEXT REFERENCES identity.tenants (id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, redirect_uri)
);

-- 契約。テナントがそのサービスを利用できるか
CREATE TABLE identity.tenant_services (
  tenant_id     TEXT NOT NULL REFERENCES identity.tenants (id) ON DELETE CASCADE,
  client_id     TEXT NOT NULL REFERENCES identity.oidc_clients (client_id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_id)
);

RESET ROLE;
