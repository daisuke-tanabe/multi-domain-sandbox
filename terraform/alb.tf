resource "aws_lb" "main" {
  name               = var.project
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "app" {
  for_each = toset(local.service_apps)

  name        = "${var.project}-${each.key}"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  deregistration_delay = 15

  health_check {
    path                = "/healthz"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "not found"
      status_code  = "404"
    }
  }
}

# ホストベースルーティング。auth を先に評価し、サービスごとに api.<service> を *.<service> より先に評価する
resource "aws_lb_listener_rule" "auth" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app["auth-api"].arn
  }

  condition {
    host_header {
      values = [local.auth_host]
    }
  }
}

locals {
  service_rule_priority = { for index, id in sort(keys(var.services)) : id => index }
}

resource "aws_lb_listener_rule" "api" {
  for_each = var.services

  listener_arn = aws_lb_listener.https.arn
  priority     = 100 + local.service_rule_priority[each.key]

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app["${each.key}-api"].arn
  }

  condition {
    host_header {
      values = [local.service_hosts[each.key].api_host]
    }
  }
}

resource "aws_lb_listener_rule" "web" {
  for_each = var.services

  listener_arn = aws_lb_listener.https.arn
  priority     = 200 + local.service_rule_priority[each.key]

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app["${each.key}-web"].arn
  }

  condition {
    host_header {
      values = ["*.${local.service_hosts[each.key].base_host}"]
    }
  }
}
