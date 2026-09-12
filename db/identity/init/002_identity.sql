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

-- ブラウザから作られた SSO Session の記録。id は ID Token に載せる sid で、Cookie の値ではない
-- 揮発ストアの寿命とは独立に残し、監査とポータルの一覧に使う
-- 失効は revoked_at で表す。status 列は持たず、revoked_at IS NULL を「有効」とする
-- 期限切れは行に書かず、created_at と last_seen_at から読み出し時に判定する
CREATE TABLE identity.auth_sessions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  ip             TEXT NOT NULL,
  user_agent     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  last_seen_at   TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  revoke_reason  TEXT CHECK (revoke_reason IN ('global_logout', 'user_revoked')),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
-- ポータルの一覧は有効な行だけを引く
CREATE INDEX auth_sessions_active_idx ON identity.auth_sessions (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

-- その SSO Session で code を発行したサービスとテナント。ポータルの一覧と、招待解除時の対象の絞り込みに使う
CREATE TABLE identity.auth_session_clients (
  session_id      TEXT NOT NULL REFERENCES identity.auth_sessions (id) ON DELETE CASCADE,
  oidc_client_id  TEXT NOT NULL REFERENCES identity.oidc_clients (id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL REFERENCES identity.tenants (id) ON DELETE CASCADE,
  first_seen_at   TIMESTAMPTZ NOT NULL,
  last_seen_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (session_id, oidc_client_id, tenant_id)
);

-- 監査イベント。Token 値、Cookie 値、パスワード、TOTP の secret は入れない
CREATE TABLE identity.audit_events (
  id           TEXT PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL,
  kind         TEXT NOT NULL,
  user_id      TEXT,
  session_id   TEXT,
  tenant_id    TEXT,
  client_id    TEXT,
  ip           TEXT,
  user_agent   TEXT,
  detail       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_user_id_idx ON identity.audit_events (user_id, occurred_at DESC);
CREATE INDEX audit_events_kind_idx ON identity.audit_events (kind, occurred_at DESC);
CREATE INDEX audit_events_session_id_idx ON identity.audit_events (session_id, occurred_at DESC);
-- 追記のみで時系列に並ぶため、期間の絞り込みは BRIN で足りる
CREATE INDEX audit_events_occurred_at_idx ON identity.audit_events USING BRIN (occurred_at);

-- 登録済みの MFA 方式。secret は Cognito が持ち、ここには方式と日時だけを残す
CREATE TABLE identity.user_mfa_methods (
  user_id      TEXT NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  method       TEXT NOT NULL CHECK (method IN ('totp')),
  enrolled_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, method)
);

RESET ROLE;
