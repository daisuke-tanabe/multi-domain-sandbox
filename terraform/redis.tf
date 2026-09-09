resource "aws_elasticache_subnet_group" "main" {
  name       = var.project
  subnet_ids = aws_subnet.private[*].id
}

# 単一ノード。VPC 内からのみ到達でき、転送暗号化は付けない。本番では transit_encryption と AUTH を有効化する
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = var.project
  description          = "SSO session and code store"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = 1
  port                 = 6379
  parameter_group_name = "default.redis7"

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false
  apply_immediately          = true
}
