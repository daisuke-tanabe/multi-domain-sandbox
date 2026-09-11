variable "project" {
  description = "リソース名の接頭辞"
  type        = string
  default     = "multi-domain-sandbox"
}

variable "region" {
  type    = string
  default = "ap-northeast-1"
}

variable "domain" {
  description = "公開ドメイン。auth.<domain> / <tenant>.<service>.<domain> / api.<service>.<domain> を切る"
  type        = string
  default     = "sandbox.daisuke-tanabe.dev"
}

variable "services" {
  description = "サービス (OIDC Client) の一覧。キーが client_id でホスト名と DB 名にもなる。tools/provision の seed-data と一致させる"
  type        = map(object({ name = string }))
  default = {
    crm = { name = "CRM" }
    cms = { name = "CMS" }
  }
}

variable "tenants" {
  description = "provision がシードするテナント slug。出力の URL にだけ使い、リソースは作らない"
  type        = list(string)
  default     = ["tanaka", "suzuki"]
}

variable "image_tag" {
  description = "ECR に push したイメージタグ。scripts/deploy.sh が git の短縮 SHA を渡す"
  type        = string
  default     = "latest"
}

variable "app_cpu" {
  type    = number
  default = 256
}

variable "app_memory" {
  type    = number
  default = 512
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
