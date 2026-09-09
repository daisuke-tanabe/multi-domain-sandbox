#!/bin/bash
# =============================================================================
# format-edited-file.sh
# =============================================================================
# 【役割】
#   PostToolUse hook (Edit / Write / MultiEdit) で編集されたファイルを
#   oxfmt --write と oxlint --fix で自動整形・自動修正し、
#   autofix で直らなかった lint 違反は Claude にフィードバックする。
#
# 【設計】
#   1. oxfmt: 整形 (上書き)、失敗しても無視
#   2. oxlint --fix: autofix 適用、失敗しても無視
#   3. oxlint (--fix なし): autofix で直らない残違反を検出
#      残違反があれば exit 2 + stderr → Claude にフィードバック
#
#   A 案 (PostToolUse で即時フィードバック) を採用。
#   Stop hook では何もしない (PostToolUse で完結するため重複不要)。
#
# 【入力】
#   stdin に Claude が渡す JSON。tool_input.file_path から対象ファイルを抽出。
#
# 【exit コード】
#   exit 0 : 違反なし、または対象外ファイル
#   exit 2 : autofix で直らない lint 違反あり → Claude が修正
# =============================================================================

input=$(cat)
file_path=$(echo "$input" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('file_path', ''))
except Exception:
    pass
" 2>/dev/null)

[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

# 対象拡張子のみ (TS / JS)
case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.cjs|*.mjs)
    ;;
  *)
    exit 0
    ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 0

rel_path="${file_path#$REPO_ROOT/}"

# pnpm exec のオーバーヘッドを避けるため node_modules/.bin を直叩き
OXFMT="$REPO_ROOT/node_modules/.bin/oxfmt"
OXLINT="$REPO_ROOT/node_modules/.bin/oxlint"

# 1. oxfmt で整形 (上書き)、失敗しても無視
[ -x "$OXFMT" ] && "$OXFMT" "$rel_path" >/dev/null 2>&1 || true

# 2. oxlint --fix で autofix 適用、失敗しても無視
[ -x "$OXLINT" ] && "$OXLINT" --fix "$rel_path" >/dev/null 2>&1 || true

# 3. autofix 後にもう一度 lint で残違反を確認
#    autofix で直らない違反 (no-explicit-any 等) があれば Claude にフィードバック
if [ -x "$OXLINT" ]; then
  if ! output=$("$OXLINT" "$rel_path" 2>&1); then
    echo "[format-edited-file] autofix で直せない lint 違反:" >&2
    echo "$output" >&2
    exit 2
  fi
fi

exit 0
