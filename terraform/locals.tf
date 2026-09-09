locals {
  auth_host = "auth.${var.domain}"
  api_host  = "api.${var.domain}"
  issuer    = "https://${local.auth_host}"
  api_url   = "https://${local.api_host}"

  apps = ["auth-server", "tenant-web", "api-server", "provision"]

  # tenant-web と provision が読む TENANT_CLIENTS。Secrets Manager に JSON 文字列として置く
  tenant_clients_json = jsonencode([
    for slug in var.tenants : {
      slug         = slug
      clientSecret = random_password.tenant_client_secret[slug].result
    }
  ])
}
