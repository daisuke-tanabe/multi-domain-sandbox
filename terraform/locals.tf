locals {
  auth_host = "auth.${var.domain}"
  issuer    = "https://${local.auth_host}"

  # サービスごとのホスト。<tenant>.<service>.<domain> が web、api.<service>.<domain> が api
  service_hosts = {
    for id, service in var.services : id => {
      base_host = "${id}.${var.domain}"
      api_host  = "api.${id}.${var.domain}"
      api_url   = "https://api.${id}.${var.domain}"
    }
  }

  web_apps = [for id in keys(var.services) : "${id}-web"]
  api_apps = [for id in keys(var.services) : "${id}-api"]
  # ALB の後ろで常駐するアプリ。provision は一回限りのタスク
  service_apps = concat(["auth-api"], local.web_apps, local.api_apps)
  apps         = concat(local.service_apps, ["provision"])

  # DB はサービスごとに RDS を分ける。identity は auth-api、crm / cms は各 api だけが接続する
  databases = {
    identity = { app_role = "sandbox_auth" }
    crm      = { app_role = "crm_app" }
    cms      = { app_role = "cms_app" }
  }

  # RDS は rds.force_ssl=1 のため TLS 必須。証明書検証は RDS CA の同梱が必要になるため sandbox では省略する
  db_master_url = {
    for name, db in local.databases :
    name => "postgres://postgres:${random_password.db_master[name].result}@${aws_db_instance.main[name].address}:5432/${name}?sslmode=no-verify"
  }
  db_app_url = {
    for name, db in local.databases :
    name => "postgres://${db.app_role}:${random_password.db_app[name].result}@${aws_db_instance.main[name].address}:5432/${name}?sslmode=no-verify"
  }

  # provision が読む SERVICES。client_secret と各サービスの DB 接続をまとめて Secrets Manager に JSON 文字列として置く
  services_json = jsonencode([
    for id, service in var.services : {
      clientId     = id
      clientSecret = random_password.client_secret[id].result
      name         = service.name
      baseHost     = local.service_hosts[id].base_host
      apiBaseUrl   = local.service_hosts[id].api_url
      databaseUrl  = local.db_master_url[id]
      dbPassword   = random_password.db_app[id].result
    }
  ])
}
