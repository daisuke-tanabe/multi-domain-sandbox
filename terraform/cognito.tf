# Cognito User Pool。Hosted UI は使わないためドメインを設定しない。
# サインアップは管理者のみ。テストユーザーは provision タスクが AdminCreateUser で作る。

resource "aws_cognito_user_pool" "main" {
  name = var.project

  auto_verified_attributes = ["email"]
  # MFA の必須化は auth-api が行う。Cognito 側は OPTIONAL にし、QR の再発行と将来のテナント別の方針を auth-api で扱えるようにする
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable             = true

    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }
}

# auth-api が USER_SRP_AUTH で使う App Client。secret 付きで SECRET_HASH を要求する
resource "aws_cognito_user_pool_client" "auth_api" {
  name         = "${var.project}-auth-api"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = true

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}
