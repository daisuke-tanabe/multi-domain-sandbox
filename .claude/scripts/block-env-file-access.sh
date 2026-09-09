#!/bin/bash
# =============================================================================
# block-env-file-access.sh
# =============================================================================
# 【役割】
#   Bash コマンドが .env ファイル（.env.example などのサンプルを除く）に
#   アクセスしようとする場合に実行をブロックする。
#   Claude が誤って .env の内容を読んだり漏洩させるリスクを防ぐセーフガード。
#
# 【呼ばれるタイミング】
#   settings.json の hooks.PreToolUse (matcher: Bash) に登録され、
#   Claude が Bash ツールを呼び出すたびにコマンド実行前に評価される。
#
# 【入力】
#   stdin に Claude が渡す JSON が流れてくる。
#   jq で tool_input.command を取り出してコマンド文字列を得る。
#
# 【ブロック対象】
#   コマンド文字列に ".env" が含まれる場合はブロック（exit 2）。
#
# 【許可する例外】
#   .env.example / .env.sample / .env.template は安全なサンプルファイルなので許可。
#   例: cat .env.example → OK
#       cat .env         → ブロック
#       cat .env.local   → ブロック
#
# 【exit コードの意味】
#   exit 2 : Claude Code がコマンド実行をブロックし、エラーとして扱う
#   exit 0 : 問題なし、コマンドをそのまま実行させる
#
# 【注意】
#   このガードは完全ではなく、あくまでうっかりミスを防ぐためのもの。
#   意図的な回避（変数経由でパスを組み立てるなど）には対応しない。
# =============================================================================

# stdin の JSON からコマンド文字列を取り出す
CMD=$(cat | jq -r '.tool_input.command // empty')

# .env を含むが、許可サフィックス（example/sample/template）ではない場合にブロック
if [[ "$CMD" =~ \.env ]] && [[ ! "$CMD" =~ \.env\.(example|sample|template) ]]; then
  echo "Blocked: .env access is not allowed: $CMD" >&2
  exit 2
fi

exit 0
