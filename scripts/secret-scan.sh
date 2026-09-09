#!/usr/bin/env bash
# 公開前チェック。追跡ファイルと全履歴を秘密値のパターンで検索する。何か出たら公開前に対処する。
#   scripts/secret-scan.sh
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

status=0
report() { echo "  $1"; status=1; }

echo "== 追跡されている機密ファイル"
while read -r file; do report "$file"; done < <(
  git ls-files | grep -E '(^|/)[.]env($|[.])|tfstate|[.]terraform/|[.]pem$|[.]key$|id_rsa|backend[.]hcl$' | grep -v '[.]example$'
)

echo "== 履歴に含まれる秘密値のパターン"
while read -r line; do report "$line"; done < <(
  git log -p --all -- . ':!scripts/secret-scan.sh' | grep -nE \
    'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|aws_secret_access_key|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|awsapps[.]com/start|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]+|-----BEGIN CERTIFICATE' \
    | head -20
)

echo "== 12 桁の AWS アカウント ID"
while read -r line; do report "$line"; done < <(
  git grep -nE '(^|[^0-9a-fA-F])[0-9]{12}([^0-9a-fA-F]|$)' -- . ':!pnpm-lock.yaml' ':!node_modules' | head -10
)

echo "== 履歴に含まれる AWS アカウント ID (terraform 配下)"
while read -r line; do report "$line"; done < <(
  git log -p --all -- terraform scripts docs | grep -nE '^[+-].*(^|[^0-9a-fA-F])[0-9]{12}([^0-9a-fA-F]|$)' | head -10
)

echo "== Cognito User Pool ID"
while read -r line; do report "$line"; done < <(git grep -nE '[a-z]{2}-[a-z]+-[0-9]_[A-Za-z0-9]{9}' -- . ':!node_modules' | head -5)

if [[ $status -eq 0 ]]; then
  echo "問題なし"
else
  echo "上記を確認してください。ローカル専用の固定値は .env.example と README で明示されていれば公開してよい"
fi
exit $status
