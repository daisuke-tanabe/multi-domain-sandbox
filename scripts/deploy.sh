#!/usr/bin/env bash
# イメージをビルドして ECR に push し、Terraform を apply する。
#   scripts/deploy.sh            通常のデプロイ
#   scripts/deploy.sh --init     初回。ECR を先に作ってから push し、全体を apply する
#   scripts/deploy.sh --push-only  ビルドと push だけ行い、apply しない
set -euo pipefail

: "${AWS_PROFILE:=multi-domain-sandbox}"
export AWS_PROFILE
REGION="${AWS_REGION:-ap-northeast-1}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/terraform"
APPS=(auth-server tenant-web api-server provision)
TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short HEAD)}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

cd "$TF_DIR"
terraform init -input=false -backend-config=backend.hcl >/dev/null

if [[ "${1:-}" == "--init" ]]; then
  echo "== creating ECR repositories first"
  terraform apply -input=false -auto-approve \
    -target='aws_ecr_repository.app' -target='aws_ecr_lifecycle_policy.app'
fi

echo "== logging in to ECR"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

for app in "${APPS[@]}"; do
  echo "== building $app:$TAG"
  docker buildx build \
    --platform linux/arm64 \
    --build-arg "APP=$app" \
    -t "$REGISTRY/multi-domain-sandbox/$app:$TAG" \
    -t "$REGISTRY/multi-domain-sandbox/$app:latest" \
    --push \
    "$ROOT"
done

if [[ "${1:-}" == "--push-only" ]]; then
  echo "== pushed tag $TAG"
  exit 0
fi

echo "== terraform apply (image_tag=$TAG)"
terraform apply -input=false -auto-approve -var "image_tag=$TAG"

echo "== done"
terraform output urls
