resource "aws_ecs_cluster" "main" {
  name = var.project
}

resource "aws_cloudwatch_log_group" "app" {
  for_each = toset(local.apps)

  name              = "/ecs/${var.project}/${each.key}"
  retention_in_days = 14
}

# タスク実行ロール。イメージ取得、ログ出力、Secrets Manager からの値取得
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.project}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "task_execution_secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.db.arn,
      aws_secretsmanager_secret.auth.arn,
      aws_secretsmanager_secret.tenant_clients.arn,
      aws_secretsmanager_secret.seed.arn,
    ]
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_secrets.json
}

# アプリのタスクロール。auth-server が使う InitiateAuth / RevokeToken は IAM 不要のため権限なし
resource "aws_iam_role" "app_task" {
  name               = "${var.project}-app-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# provision タスクロール。テストユーザー作成のため Cognito の Admin API を許可する
resource "aws_iam_role" "provision_task" {
  name               = "${var.project}-provision-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "provision_cognito" {
  statement {
    actions = [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminUpdateUserAttributes",
      "cognito-idp:AdminGetUser",
    ]
    resources = [aws_cognito_user_pool.main.arn]
  }
}

resource "aws_iam_role_policy" "provision_cognito" {
  name   = "cognito"
  role   = aws_iam_role.provision_task.id
  policy = data.aws_iam_policy_document.provision_cognito.json
}

locals {
  redis_url = "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"

  log_configuration = {
    for app in local.apps : app => {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[app].name
        awslogs-region        = var.region
        awslogs-stream-prefix = "ecs"
      }
    }
  }

  container_definitions = {
    "auth-server" = {
      environment = {
        PORT                    = "3000"
        ISSUER                  = local.issuer
        API_AUDIENCE            = local.api_url
        COOKIE_SECURE           = "true"
        TOKEN_ENCRYPTION_KEY_ID = "tf-1"
        REDIS_URL               = local.redis_url
        COGNITO_ADAPTER         = "sdk"
        COGNITO_REGION          = var.region
        COGNITO_USER_POOL_ID    = aws_cognito_user_pool.main.id
        COGNITO_CLIENT_ID       = aws_cognito_user_pool_client.auth_server.id
      }
      secrets = {
        DATABASE_URL          = "${aws_secretsmanager_secret.db.arn}:auth_url::"
        TOKEN_ENCRYPTION_KEY  = "${aws_secretsmanager_secret.auth.arn}:token_encryption_key::"
        SIGNING_KEY_PEM       = "${aws_secretsmanager_secret.auth.arn}:signing_key_pem::"
        COGNITO_CLIENT_SECRET = "${aws_secretsmanager_secret.auth.arn}:cognito_client_secret::"
      }
    }
    "tenant-web" = {
      environment = {
        PORT                = "3000"
        PUBLIC_SCHEME       = "https"
        PUBLIC_BASE_HOST    = var.domain
        ISSUER              = local.issuer
        API_BACKCHANNEL_URL = local.api_url
        COOKIE_SECURE       = "true"
        REDIS_URL           = local.redis_url
      }
      secrets = {
        TENANT_CLIENTS = "${aws_secretsmanager_secret.tenant_clients.arn}:json::"
      }
    }
    "api-server" = {
      environment = {
        PORT         = "3000"
        API_AUDIENCE = local.api_url
        ISSUER       = local.issuer
      }
      secrets = {
        DATABASE_URL = "${aws_secretsmanager_secret.db.arn}:api_url::"
      }
    }
    "provision" = {
      environment = {
        PUBLIC_SCHEME        = "https"
        PUBLIC_BASE_HOST     = var.domain
        COGNITO_REGION       = var.region
        COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
      }
      secrets = {
        DATABASE_URL       = "${aws_secretsmanager_secret.db.arn}:master_url::"
        AUTH_DB_PASSWORD   = "${aws_secretsmanager_secret.db.arn}:auth_password::"
        API_DB_PASSWORD    = "${aws_secretsmanager_secret.db.arn}:api_password::"
        TENANT_CLIENTS     = "${aws_secretsmanager_secret.tenant_clients.arn}:json::"
        SEED_USER_PASSWORD = "${aws_secretsmanager_secret.seed.arn}:user_password::"
      }
    }
  }
}

resource "aws_ecs_task_definition" "app" {
  for_each = local.container_definitions

  family                   = "${var.project}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.app_cpu
  memory                   = var.app_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = each.key == "provision" ? aws_iam_role.provision_task.arn : aws_iam_role.app_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${aws_ecr_repository.app[each.key].repository_url}:${var.image_tag}"
      essential = true
      portMappings = each.key == "provision" ? [] : [
        { containerPort = 3000, protocol = "tcp" }
      ]
      environment      = [for k, v in each.value.environment : { name = k, value = v }]
      secrets          = [for k, v in each.value.secrets : { name = k, valueFrom = v }]
      logConfiguration = local.log_configuration[each.key]
    }
  ])
}

resource "aws_ecs_service" "app" {
  for_each = toset(["auth-server", "tenant-web", "api-server"])

  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app[each.key].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app[each.key].arn
    container_name   = each.key
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.https]
}
