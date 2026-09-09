#!/bin/bash
# =============================================================================
# check-pr-template.sh
# =============================================================================
# 【役割】
#   `gh pr create` のコマンドが .github/pull_request_template.md の構造に
#   従っていない場合に PR 作成をブロックする。
#   Claude Code が組み込みのデフォルトテンプレ (## Summary / ## Test plan) で
#   PR を作らないようにガードする。
#
# 【呼ばれるタイミング】
#   settings.json の hooks.PreToolUse (matcher: Bash) に登録され、
#   Claude が Bash ツールを呼び出すたびにコマンド実行前に評価される。
#
# 【入力】
#   stdin に Claude が渡す JSON。jq で tool_input.command を抽出。
#
# 【検出方法】
#   1. コマンドに `gh pr create` を含むか
#   2. `--body-file <path>` または HEREDOC (<<'EOF' ... EOF) から本文を抽出
#   3. 必須セクション (変更内容 / 動機・背景 / 実装のポイント / テスト / チェックリスト)
#      が `## <セクション名>` の形式で存在するかチェック
#
# 【exit コード】
#   exit 0 : 通過 (gh pr create でない、または必須セクション揃っている)
#   exit 2 : ブロック (必須セクション欠落) - stderr を Claude にフィードバック
#
# 【注意】
#   `--body "..."` のインライン文字列は抽出が困難なため、本フックでは
#   HEREDOC または --body-file の利用を前提とする。
# =============================================================================

set -euo pipefail

CMD=$(cat | jq -r '.tool_input.command // empty')

# gh pr create を含まないなら通過
if ! grep -qE '(^|[[:space:];&|])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' <<< "$CMD"; then
  exit 0
fi

BODY=""

# --body-file <path> または --body-file=<path> から中身を読む
BODY_FILE=$(grep -oE -- "--body-file[= ][^[:space:]'\"]+" <<< "$CMD" \
  | head -n1 \
  | sed -E 's/^--body-file[= ]//' \
  | tr -d "'\"" || true)
if [[ -n "$BODY_FILE" && -f "$BODY_FILE" ]]; then
  BODY=$(cat "$BODY_FILE")
fi

# HEREDOC (cat <<'EOF' ... EOF) から中身を抽出
if [[ -z "$BODY" ]] && grep -qE "<<-?'?EOF'?" <<< "$CMD"; then
  BODY=$(awk "
    /<<-?'?EOF'?/ { flag = 1; next }
    /^[[:space:]]*EOF[[:space:]]*\$/ { flag = 0; next }
    flag { print }
  " <<< "$CMD")
fi

# 本文が取れない場合 (--body \"...\" 直渡し等) は方針違反としてブロック
if [[ -z "$BODY" ]]; then
  cat <<'MSG' >&2
[check-pr-template] gh pr create の本文を抽出できませんでした。
HEREDOC (--body "$(cat <<'EOF' ... EOF)") か --body-file で渡してください。
MSG
  exit 2
fi

REQUIRED_SECTIONS=(
  "変更内容"
  "動機・背景"
  "実装のポイント"
  "テスト"
  "チェックリスト"
)

MISSING=()
for section in "${REQUIRED_SECTIONS[@]}"; do
  if ! grep -qE "^##[[:space:]].*${section}" <<< "$BODY"; then
    MISSING+=("$section")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  {
    echo "[check-pr-template] PR 本文に必須セクションが不足しています:"
    for section in "${MISSING[@]}"; do
      echo "  - ## ${section}"
    done
    echo ""
    echo ".github/pull_request_template.md の構造に従って書き直してください。"
  } >&2
  exit 2
fi

exit 0
