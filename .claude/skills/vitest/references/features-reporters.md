---
name: reporters
description: 組み込みレポーター、デフォルト選択、CI・出力の設定
---

# レポーター

レポーターは `--reporter` または `reporters` config で選択する。`reporters` を設定するとデフォルトのリストは置き換えられる。維持したい場合は `configDefaults.reporters` をスプレッドする。

```ts
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['verbose', ['junit', { suiteName: 'UI tests' }]],
    // デフォルトを維持しつつ 1 つ追加する:
    // reporters: ['json', ...configDefaults.reporters],
  },
})
```

## デフォルト選択

`reporters` が未設定のとき、Vitest は自動選択する:

- 通常のターミナル実行では `default`
- AI コーディングエージェントを検出すると `minimal` (エイリアス `agent`) — 失敗したテストとエラーのみを出力し、サマリーや成功ログを省いてトークン使用量を削減する
- `process.env.GITHUB_ACTIONS === 'true'` のときは `github-actions` が追加される

## 組み込みレポーター

| レポーター | 用途 |
|----------|-----|
| `default` | サマリー + 成功したファイルを折りたたむ。単一 / 失敗ファイルは完全なツリーを表示 |
| `verbose` | 完了したテストごとに 1 行 (v4 ではフラットなリスト)。成功時にアノテーションを表示する唯一のレポーター |
| `tree` | `default` に似るが常に各テストを表示 (v3 の verbose 相当) |
| `dot` | テストごとに 1 ドット。詳細は失敗時のみ |
| `minimal` / `agent` | 失敗のみ。AI / LLM ワークフローに最適 |
| `junit` | JUnit XML (テンプレート対応、下記参照) |
| `json` | Jest 互換 JSON。カバレッジ有効時は `coverageMap` を含む |
| `tap` / `tap-flat` | TAP (ネスト / フラット) |
| `html` | インタラクティブな UI レポート (`@vitest/ui` が必要) |
| `blob` | `--merge-reports` 用のシリアライズ済み結果 |
| `github-actions` | ワークフローアノテーション + ジョブサマリー |
| `hanging-process` | 終了を妨げているプロセスを一覧表示 (デバッグ用) |

> v4 で `basic` レポーターは削除された (`['default', { summary: false }]` と同等)。旧 `verbose` のフラットな挙動はここに移り、ネスト表示には `tree` を使う。

## 出力ファイル

```bash
vitest --reporter=json --outputFile=./test-output.json
```

```ts
defineConfig({
  test: {
    reporters: ['junit', 'json'],
    outputFile: { junit: './junit.xml', json: './report.json' },
  },
})
```

## JUnit のテンプレート

```ts
reporters: [['junit', {
  suiteNameTemplate: '{title}',     // {title} {filename} {basename} {displayName}
  classnameTemplate: '{classname}', // {classname} {title} {suitename} {filename} ...
  titleTemplate: '{title}',
  ancestorSeparator: ' > ',
  addFileAttribute: true,
}]]
```

`{filename}` は相対パスである。ファイル名だけが必要な場合は `{basename}` を使う。テンプレートにはすべての変数を受け取る関数も指定できる。

## HTML レポート (v5 のパス)

HTML レポーターは `outputDir` (デフォルト `.vitest`) にディレクトリを書き出し、エントリは `<outputDir>/index.html` になる。単体で共有できるファイルが必要な場合は `singleFile: true` を使う。サイズは大きく、カバレッジはインライン化されない。

```ts
reporters: [['html', { singleFile: true }]]
```

## Blob とマージ (CI / シャーディング)

blob はデフォルトで `.vitest/blob/` に出力される。環境のラベル付けには `VITEST_BLOB_LABEL` またはレポーターの `label` オプションを使う:

```bash
vitest run --reporter=blob --outputFile=reports/blob-1.json
vitest --merge-reports=reports --reporter=junit --reporter=default
```

blob レポートにはファイル添付が含まれない。`attachmentsDir` (`.vitest/attachments/`) は別途マージする。`--reporter=blob` / `--merge-reports` は watch モードでは動作しない。

## 要点

- `reporters` の設定はデフォルトを置き換える。維持するには `configDefaults.reporters` をスプレッドする
- `minimal` / `agent` レポーターは AI エージェント向けに自動選択され、トークン使用量を最小化する
- ネストされたテスト単位の表示には `tree` を使う (v3 の `verbose` 相当)
- v5 の成果物 (blob、添付ファイル、HTML) は `.vitest/` 配下に置かれる

<!--
Source references:
- https://vitest.dev/guide/reporters
- https://vitest.dev/config/reporters
-->
