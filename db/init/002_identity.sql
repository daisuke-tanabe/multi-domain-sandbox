-- Identity スキーマ。所有者は sandbox_auth
-- docs/design/05-data-model.md に対応する

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

CREATE TABLE identity.oidc_clients (
  client_id              TEXT PRIMARY KEY,
  client_secret_hash     TEXT NOT NULL,
  tenant_id              TEXT REFERENCES identity.tenants (id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  allowed_scopes         TEXT[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
  backchannel_logout_uri TEXT,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.oidc_client_redirect_uris (
  client_id     TEXT NOT NULL REFERENCES identity.oidc_clients (client_id) ON DELETE CASCADE,
  redirect_uri  TEXT NOT NULL,
  PRIMARY KEY (client_id, redirect_uri)
);

RESET ROLE;
