output "name_servers" {
  description = "親ゾーンに NS 委任するネームサーバー"
  value       = aws_route53_zone.sandbox.name_servers
}

output "urls" {
  value = {
    portal  = local.issuer
    tenants = { for slug in var.tenants : slug => "https://${slug}.${var.domain}" }
    api     = local.api_url
    alb_dns = aws_lb.main.dns_name
  }
}

output "ecr_repositories" {
  value = { for app, repo in aws_ecr_repository.app : app => repo.repository_url }
}

output "ecs" {
  value = {
    cluster             = aws_ecs_cluster.main.name
    provision_task      = aws_ecs_task_definition.app["provision"].family
    subnet_id           = aws_subnet.public[0].id
    security_group_id   = aws_security_group.app.id
    log_group_provision = aws_cloudwatch_log_group.app["provision"].name
  }
}

output "cognito" {
  value = {
    user_pool_id = aws_cognito_user_pool.main.id
    client_id    = aws_cognito_user_pool_client.auth_server.id
  }
}

output "seed_secret_arn" {
  description = "テストユーザーのパスワードが入った Secrets Manager シークレット"
  value       = aws_secretsmanager_secret.seed.arn
}
