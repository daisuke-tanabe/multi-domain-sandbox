#!/usr/bin/env bash
# 親ゾーン (daisuke-tanabe.dev、別アカウント) に sandbox サブドメインの NS 委任レコードを作る。一度だけ実行する。
#   PARENT_PROFILE=daisuke-tanabe scripts/delegate-dns.sh
set -euo pipefail

: "${AWS_PROFILE:=multi-domain-sandbox}"
: "${PARENT_PROFILE:=daisuke-tanabe}"
: "${PARENT_ZONE:=daisuke-tanabe.dev}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/terraform"

# 全体 apply 前でも動くよう、DOMAIN は環境変数か output の domain から取る
DOMAIN="${DOMAIN:-$(terraform output -raw domain 2>/dev/null || true)}"
[[ -n "$DOMAIN" ]] || { echo "DOMAIN を指定してください"; exit 1; }
NS_JSON=$(AWS_PROFILE="$AWS_PROFILE" terraform output -json name_servers)

PARENT_ZONE_ID=$(aws route53 list-hosted-zones-by-name --profile "$PARENT_PROFILE" \
  --dns-name "$PARENT_ZONE" --query 'HostedZones[0].Id' --output text)

CHANGE=$(jq -n --arg name "$DOMAIN." --argjson ns "$NS_JSON" '{
  Comment: "delegate sandbox subdomain",
  Changes: [{
    Action: "UPSERT",
    ResourceRecordSet: {
      Name: $name, Type: "NS", TTL: 300,
      ResourceRecords: ($ns | map({Value: .}))
    }
  }]
}')

echo "== delegating $DOMAIN in $PARENT_ZONE ($PARENT_ZONE_ID) via profile $PARENT_PROFILE"
echo "$NS_JSON"
aws route53 change-resource-record-sets --profile "$PARENT_PROFILE" \
  --hosted-zone-id "$PARENT_ZONE_ID" --change-batch "$CHANGE" \
  --query 'ChangeInfo.Status' --output text
