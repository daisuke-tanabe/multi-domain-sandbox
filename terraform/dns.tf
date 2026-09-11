# このアカウントに <domain> のホストゾーンを作る。
# 親ゾーン (daisuke-tanabe.dev) への NS 委任は scripts/delegate-dns.sh で一度だけ行う。

resource "aws_route53_zone" "sandbox" {
  name = var.domain
}

# ワイルドカードは 1 階層しか覆わないため、auth 用の *.<domain> に加えてサービスごとに *.<service>.<domain> を SAN に入れる
resource "aws_acm_certificate" "main" {
  domain_name = "*.${var.domain}"
  subject_alternative_names = concat(
    [var.domain],
    [for id in keys(var.services) : "*.${id}.${var.domain}"],
  )
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = aws_route53_zone.sandbox.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.acm_validation : record.fqdn]
}

resource "aws_route53_record" "auth" {
  zone_id = aws_route53_zone.sandbox.zone_id
  name    = local.auth_host
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = false
  }
}

# テナントは増減するため個別レコードにせず、サービスごとのワイルドカードで受ける。api.<service>.<domain> も同じレコードで解決する
resource "aws_route53_record" "service_wildcard" {
  for_each = var.services

  zone_id = aws_route53_zone.sandbox.zone_id
  name    = "*.${each.key}.${var.domain}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = false
  }
}
