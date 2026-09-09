#!/usr/bin/env bash
# 課金対象をすべて削除し、Route 53 ホストゾーンだけ残す。
# ゾーンを消すと親ゾーンの NS 委任が宙に浮き、第三者にサブドメインを乗っ取られ得るため残す。
#   scripts/teardown.sh
set -euo pipefail

: "${AWS_PROFILE:=multi-domain-sandbox}"
export AWS_PROFILE
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/terraform"
terraform init -input=false -backend-config=backend.hcl >/dev/null

ZONE_ID=$(terraform state show aws_route53_zone.sandbox 2>/dev/null | awk -F'"' '/^\s+zone_id\s+=/ {print $2}')
if [[ -z "$ZONE_ID" ]]; then
  echo "aws_route53_zone.sandbox が state にありません。全体を destroy します"
  terraform destroy -input=false -auto-approve
  exit 0
fi

# ゾーンを一時的に state から外し、残りをすべて destroy する
echo "== keeping hosted zone $ZONE_ID"
terraform state rm aws_route53_zone.sandbox >/dev/null
terraform destroy -input=false -auto-approve

# 他リソースがない状態では for_each を評価できず terraform import が失敗するため、import ブロックで取り込む
printf 'import {\n  to = aws_route53_zone.sandbox\n  id = "%s"\n}\n' "$ZONE_ID" > import-zone.tf
terraform apply -input=false -auto-approve -target=aws_route53_zone.sandbox
rm -f import-zone.tf

echo "== remaining state"
terraform state list
echo "== done. 次回は scripts/deploy.sh --init と scripts/run-provision.sh で同じ URL に復元できる"
