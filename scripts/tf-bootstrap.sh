#!/usr/bin/env bash
# Terraform state 用の S3 バケットを作る。Terraform 管理外で一度だけ実行する。
set -euo pipefail

: "${AWS_PROFILE:=multi-domain-sandbox}"
export AWS_PROFILE
REGION="${AWS_REGION:-ap-northeast-1}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="${ACCOUNT_ID}-multi-domain-sandbox-tfstate"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "bucket already exists: $BUCKET"
else
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  echo "created: $BUCKET"
fi

aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "state bucket ready: $BUCKET"
echo "terraform/versions.tf の backend bucket が一致していることを確認してください"
