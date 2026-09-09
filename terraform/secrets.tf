# 秘密値はすべて Terraform で生成し Secrets Manager に置く。ECS は valueFrom で注入する。
# 生成値は state にも入るため、state バケットは暗号化とアクセス制限を前提にする。

# DB パスワードは接続 URL に埋め込むため記号を使わない
resource "random_password" "db_master" {
  length  = 32
  special = false
}

resource "random_password" "db_auth" {
  length  = 32
  special = false
}

resource "random_password" "db_api" {
  length  = 32
  special = false
}

resource "random_password" "tenant_client_secret" {
  for_each = toset(var.tenants)

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

resource "aws_secretsmanager_secret" "db" {
  name                    = "${var.project}/db"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    master_password = random_password.db_master.result
    auth_password   = random_password.db_auth.result
    api_password    = random_password.db_api.result
    # RDS は rds.force_ssl=1 のため TLS 必須。証明書検証は RDS CA の同梱が必要になるため sandbox では省略する
    master_url = "postgres://postgres:${random_password.db_master.result}@${aws_db_instance.main.address}:5432/sandbox?sslmode=no-verify"
    auth_url   = "postgres://sandbox_auth:${random_password.db_auth.result}@${aws_db_instance.main.address}:5432/sandbox?sslmode=no-verify"
    api_url    = "postgres://sandbox_api:${random_password.db_api.result}@${aws_db_instance.main.address}:5432/sandbox?sslmode=no-verify"
  })
}

resource "aws_secretsmanager_secret" "auth" {
  name                    = "${var.project}/auth-server"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "auth" {
  secret_id = aws_secretsmanager_secret.auth.id
  secret_string = jsonencode({
    token_encryption_key  = random_bytes.token_encryption_key.base64
    signing_key_pem       = tls_private_key.signing.private_key_pem_pkcs8
    cognito_client_secret = aws_cognito_user_pool_client.auth_server.client_secret
  })
}

resource "aws_secretsmanager_secret" "tenant_clients" {
  name                    = "${var.project}/tenant-clients"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "tenant_clients" {
  secret_id     = aws_secretsmanager_secret.tenant_clients.id
  secret_string = jsonencode({ json = local.tenant_clients_json })
}

resource "aws_secretsmanager_secret" "seed" {
  name                    = "${var.project}/seed"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "seed" {
  secret_id     = aws_secretsmanager_secret.seed.id
  secret_string = jsonencode({ user_password = random_password.seed_user.result })
}
