# 秘密値はすべて Terraform で生成し Secrets Manager に置く。ECS は valueFrom で注入する。
# 生成値は state にも入るため、state バケットは暗号化とアクセス制限を前提にする。

# DB パスワードは接続 URL に埋め込むため記号を使わない。RDS ごとにマスターとアプリ用ロールを分ける
resource "random_password" "db_master" {
  for_each = local.databases

  length  = 32
  special = false
}

resource "random_password" "db_app" {
  for_each = local.databases

  length  = 32
  special = false
}

# サービスの client_secret。ハッシュが SHA-256 のみなので 43 文字以上を要求される
resource "random_password" "client_secret" {
  for_each = var.services

  length  = 48
  special = false
}

# Cognito のパスワードポリシーを満たすテストユーザー用パスワード
resource "random_password" "seed_user" {
  length           = 20
  special          = true
  override_special = "!@#$%^&*"
  min_lower        = 2
  min_upper        = 2
  min_numeric      = 2
  min_special      = 2
}

resource "random_bytes" "token_encryption_key" {
  length = 32
}

resource "tls_private_key" "signing" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

# DB の接続情報。<name>_master_url は provision、<name>_app_url は各アプリが使う
resource "aws_secretsmanager_secret" "db" {
  name                    = "${var.project}/db"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode(merge(
    { for name, url in local.db_master_url : "${name}_master_url" => url },
    { for name, url in local.db_app_url : "${name}_app_url" => url },
    { for name, db in local.databases : "${name}_app_password" => random_password.db_app[name].result },
  ))
}

resource "aws_secretsmanager_secret" "auth" {
  name                    = "${var.project}/auth-api"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "auth" {
  secret_id = aws_secretsmanager_secret.auth.id
  secret_string = jsonencode({
    token_encryption_key  = random_bytes.token_encryption_key.base64
    signing_key_pem       = tls_private_key.signing.private_key_pem_pkcs8
    cognito_client_secret = aws_cognito_user_pool_client.auth_api.client_secret
  })
}

# サービスの秘密値。<id>_client_secret は各 *-web / *-api、json は provision の SERVICES
resource "aws_secretsmanager_secret" "services" {
  name                    = "${var.project}/services"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "services" {
  secret_id = aws_secretsmanager_secret.services.id
  secret_string = jsonencode(merge(
    { json = local.services_json },
    { for id in keys(var.services) : "${id}_client_secret" => random_password.client_secret[id].result },
  ))
}

resource "aws_secretsmanager_secret" "seed" {
  name                    = "${var.project}/seed"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "seed" {
  secret_id     = aws_secretsmanager_secret.seed.id
  secret_string = jsonencode({ user_password = random_password.seed_user.result })
}
