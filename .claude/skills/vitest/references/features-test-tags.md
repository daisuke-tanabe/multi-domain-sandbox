---
name: test-tags
description: タグでテストにラベルを付け、実行の絞り込みや共有 runner オプションの適用を行う
---

# Test Tags (4.1+)

タグはテストにラベルを付け、実行対象の絞り込みや、多数のファイルにまたがるカテゴリへの共有オプション (timeout、retry) の適用を可能にする。カテゴリごとに必要なのが timeout / retry の違いであればタグを、プールや環境の違いであれば projects を選ぶ。

## タグの定義

タグは config での宣言が必須である。未定義のタグを使うと `strictTags: false` にしない限り throw する。各タグには、そのタグを付けたすべてのテストに適用されるオプションを持たせられる:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    tags: [
      { name: 'frontend', description: 'Frontend tests.' },
      { name: 'db', description: 'Database queries.', timeout: 60_000 },
      {
        name: 'flaky',
        retry: process.env.CI ? 3 : 0,
        timeout: 30_000,
        priority: 1, // 競合時は priority の数値が小さい方が勝つ
      },
    ],
    strictTags: true, // デフォルト: 未知のタグでエラー
  },
})
```

型安全なタグ名にするには `TestTags` を augment し、そのファイルを tsconfig に含める:

```ts
import 'vitest'

declare module 'vitest' {
  interface TestTags {
    tags: 'frontend' | 'backend' | 'db' | 'flaky'
  }
}
```

## タグの適用

```ts
import { describe, test } from 'vitest'

test('renders homepage', { tags: ['frontend'] }, () => {})

// タグは親スイートから継承される
describe('API endpoints', { tags: ['backend'] }, () => {
  test('validates input', { tags: ['validation'] }, () => {
    // 継承した "backend" と "validation" の両方を持つ
  })
})
```

ファイル先頭の JSDoc `@module-tag` でファイル内の全テストにタグを付けられる。直後のテストだけでなくファイル内のすべてのテストに適用される:

```ts
/**
 * @module-tag admin/pages/dashboard
 */
test('dashboard renders', () => {})
```

### オプション競合の解決

複数のタグが同じオプションを設定した場合、まず `priority` の数値が小さい方が勝ち、次に配列の順序で決まる。テスト自身に指定したオプションが常に最優先される:

```ts
test('flaky db test', { tags: ['flaky', 'db'] }) // timeout 30_000 (flaky が priority 1)、retry 3
test('override', { tags: ['flaky', 'db'], timeout: 120_000 }) // timeout 120_000、retry 3
```

## タグでの絞り込み

`--tagsFilter` に式を渡す:

```bash
vitest --tagsFilter "frontend"
vitest --tagsFilter "db && !flaky"
vitest --tagsFilter "(unit || e2e) && !slow"
vitest --tagsFilter "api/*"            # ワイルドカード
vitest --list-tags                     # 定義済みタグを一覧 (=json で JSON 出力)
```

演算子: `and` / `&&`、`or` / `||`、`not` / `!`、`*` ワイルドカード、`()` グループ化。優先順位は `not` > `and` > `or`。複数の `--tagsFilter` フラグは AND で結合される。タグ名に `and` / `or` / `not` は使えず、特殊文字やスペースも含められない。

プログラマティックには `startVitest` / `createVitest` に `tagsFilter: ['frontend and backend']` を渡す。

## ランタイムでのフィルタ確認

マッチするテストが予定されていないときに高コストなセットアップをスキップする:

```ts
import { beforeAll, TestRunner } from 'vitest'

beforeAll(async () => {
  if (TestRunner.matchesTags(['db'])) {
    await seedDatabase()
  }
})
```

アクティブな `--tagsFilter` がそのタグを持つテストを含む場合、またはフィルタが無い場合に `true` を返す。

## 要点

- タグは config での宣言が必須。CLI のフィルタは `--tagsFilter` である。`--tags` ではない
- タグは親スイートと `@module-tag` JSDoc コメントから継承される
- timeout / retry を共有する横断的カテゴリにはタグを使い、プールや環境が異なる場合は [projects](advanced-projects.md) を使う
- `TestRunner.matchesTags` で高コストな `globalSetup` / `beforeAll` の処理をガードする

<!--
Source references:
- https://vitest.dev/guide/test-tags
- https://vitest.dev/config/tags
-->
