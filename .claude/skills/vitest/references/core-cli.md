---
name: vitest-cli
description: コマンドラインインターフェースのコマンドとオプション
---

# コマンドラインインターフェース

## コマンド

### `vitest`

Vitest を watch モード (dev) または run モード (CI) で起動する:

```bash
vitest                    # dev では watch モード、CI では run モード
vitest foobar             # パスに "foobar" を含むテストを実行
vitest basic/foo.test.ts:10  # ファイルと行番号で特定のテストを実行
```

### `vitest run`

watch モードを使わず一度だけテストを実行する:

```bash
vitest run
vitest run --coverage
```

### `vitest watch`

明示的に watch モードを起動する:

```bash
vitest watch
```

### `vitest related`

特定のファイルを import しているテストを実行する (lint-staged と組み合わせると便利):

```bash
vitest related src/index.ts src/utils.ts --run
```

### `vitest bench`

ベンチマークテストのみを実行する:

```bash
vitest bench
```

### `vitest list`

マッチする全テストを実行せずに一覧表示する:

```bash
vitest list                    # テスト名を一覧
vitest list --json             # JSON 形式で出力
vitest list --filesOnly        # テストファイルのみ一覧
```

### `vitest init`

プロジェクトのセットアップを初期化する:

```bash
vitest init browser            # ブラウザテストのセットアップ
```

### `vitest --list-tags`

テストを実行せずに config で定義されたタグを一覧表示する:

```bash
vitest --list-tags             # 人が読みやすい一覧
vitest --list-tags=json        # JSON 出力
```

## よく使うオプション

```bash
# 設定
--config <path>           # 設定ファイルのパス
--project <name>          # 特定の project を実行

# フィルタリング
--testNamePattern, -t     # パターンに一致するテストを実行
--tagsFilter <expr>       # タグ式でテストを実行、例: "db && !flaky"
--changed                 # 変更されたファイルに対するテストを実行
--changed HEAD~1          # 直近コミットの変更に対するテスト
--dir <path>              # テスト探索を特定ディレクトリに限定

# レポーター
--reporter <name>         # default, verbose, tree, dot, json, html, junit, minimal, blob
--reporter=json --outputFile=report.json

# カバレッジ
--coverage                # カバレッジを有効化
--coverage.provider v8    # v8 プロバイダーを利用
--coverage.reporter text,html

# 実行
--shard <index>/<count>   # 複数マシンへテストを分割
--bail <n>                # n 件失敗で停止
--retry <n>               # 失敗したテストを n 回リトライ
--shuffle                 # テスト順序をランダム化
--no-file-parallelism     # テストファイルを 1 つずつ実行

# watch モード
--no-watch                # watch モードを無効化
--standalone              # テストを実行せずに起動 (v4: フィルタ指定時はマッチしたファイルを実行)

# 環境
--environment <env>       # jsdom, happy-dom, node
--globals                 # グローバル API を有効化

# デバッグ
--inspect                 # Node inspector を有効化
--inspect-brk             # 起動時にブレーク

# 出力
--silent                  # コンソール出力を抑制
--no-color                # カラー出力を無効化
```

## Package.json のスクリプト

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:ui": "vitest --ui",
    "coverage": "vitest run --coverage"
  }
}
```

## CI 向けのシャーディング

複数マシンにテストを分割する。blob レポーターはデフォルトで `.vitest/blob/` に書き込む:

```bash
# Machine 1
vitest run --shard=1/3 --reporter=blob --outputFile=reports/blob-1.json

# Machine 2
vitest run --shard=2/3 --reporter=blob --outputFile=reports/blob-2.json

# すべての blob を最終レポートにマージ
vitest --merge-reports=reports --reporter=junit --reporter=default
```

## watch モードのキーボードショートカット

watch モード中にキー入力する:
- `a` - 全テストを実行
- `f` - 失敗したテストだけを実行
- `u` - スナップショットを更新
- `p` - ファイル名パターンで絞り込み
- `t` - テスト名パターンで絞り込み
- `q` - 終了

## 要点

- dev では watch モード、CI では run モードがデフォルト (`process.env.CI` が設定されている場合)
- 1 回実行を保証するには `--run` フラグを使う (lint-staged で重要)
- camelCase (`--testTimeout`) と kebab-case (`--test-timeout`) のどちらでも動作する
- 真偽値オプションは `--no-` プレフィックスで否定できる
- タグでの絞り込みには `--tagsFilter` を使う。タグは config での宣言が必要 — [features-test-tags](features-test-tags.md) を参照
- `--merge-reports` と `--reporter=blob` は watch モードでは動作しない

<!-- 
Source references:
- https://vitest.dev/guide/cli.html
-->
