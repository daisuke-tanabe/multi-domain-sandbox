resource "aws_db_subnet_group" "main" {
  name       = var.project
  subnet_ids = aws_subnet.private[*].id
}

# DB はサービスごとに RDS を分ける。identity / crm / cms の 3 台。データベース名はインスタンス名と同じ
resource "aws_db_instance" "main" {
  for_each = local.databases

  identifier = "${var.project}-${each.key}"

  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = each.key
  username = "postgres"
  password = random_password.db_master[each.key].result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 1
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true
}
