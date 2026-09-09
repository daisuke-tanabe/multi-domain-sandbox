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
  description = "公開ドメイン。auth.<domain> / api.<domain> / <tenant>.<domain> を切る"
  type        = string
  default     = "sandbox.daisuke-tanabe.dev"
}

variable "tenants" {
  description = "テナント slug の一覧。Client と client_secret をテナントごとに作る"
  type        = list(string)
  default     = ["tenant-a", "tenant-b"]
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
