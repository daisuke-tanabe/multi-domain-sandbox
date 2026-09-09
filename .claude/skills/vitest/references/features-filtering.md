---
name: test-filtering
description: 名前、ファイルパターン、タグでテストを絞り込む
---

# テストの絞り込み

## CLI でのフィルタリング

### ファイルパスで絞り込む

```bash
# "user" を含むファイルを実行
vitest user

# 複数パターン
vitest user auth

# 特定のファイル
vitest src/user.test.ts

# 行番号で指定
vitest src/user.test.ts:25
```

### テスト名で絞り込む

```bash
# パターンに一致するテスト
vitest -t "login"
vitest --testNamePattern "should.*work"

# 正規表現パターン
vitest -t "/user|auth/"
```

## 変更ファイル

```bash
# 未コミットの変更
vitest --changed

# 特定のコミット以降
vitest --changed HEAD~1
vitest --changed abc123

# 特定のブランチ以降
vitest --changed origin/main
```

## 関連ファイル

特定のファイルを import しているテストを実行する:

```bash
vitest related src/utils.ts src/api.ts --run
```

lint-staged と組み合わせると便利:

```js
// .lintstagedrc.js
export default {
  '*.{ts,tsx}': 'vitest related --run',
}
```

## Focus テスト (.only)

```ts
test.only('only this runs', () => {})

describe.only('only this suite', () => {
  test('runs', () => {})
})
```

CI では設定しない限り `.only` は例外を投げる:

```ts
defineConfig({
  test: {
    allowOnly: true, // CI でも .only を許可
  },
})
```

## Skip テスト

```ts
test.skip('skipped', () => {})

// 条件付き
test.skipIf(process.env.CI)('not in CI', () => {})
test.runIf(!process.env.CI)('local only', () => {})

// 動的 skip
test('dynamic', ({ skip }) => {
  skip(someCondition, 'reason')
})
```

## タグ

タグは config で宣言し、テスト / スイートに適用し、タグ式で絞り込む:

```ts
// vitest.config.ts
defineConfig({
  test: {
    tags: [{ name: 'db' }, { name: 'slow' }, { name: 'flaky' }],
  },
})

// テストファイル
test('database test', { tags: ['db'] }, () => {})
```

```bash
vitest --tagsFilter "db && !flaky"
vitest --tagsFilter "unit || e2e"
vitest --list-tags            # 定義済みタグを表示
```

構文の全体、priority、タグごとのオプションは [features-test-tags](features-test-tags.md) を参照。

## include / exclude パターン

```ts
defineConfig({
  test: {
    // テストファイルのパターン
    include: ['**/*.{test,spec}.{ts,tsx}'],
    
    // 除外パターン
    exclude: [
      '**/node_modules/**',
      '**/e2e/**',
      '**/*.skip.test.ts',
    ],
    
    // in-source testing 用の source 指定
    includeSource: ['src/**/*.ts'],

    // 探索範囲をディレクトリに限定する (広範な exclude より高速)
    dir: './src',
  },
})
```

> v4 では `exclude` のデフォルトが `node_modules` / `.git` のみに簡素化された。テストの探索範囲は `test.dir` で限定するのが望ましい。従来の除外を復元するには `configDefaults.exclude` をスプレッドする。

## watch モードでの絞り込み

watch モード中にキーを押す:
- `p` - ファイル名パターンで絞り込み
- `t` - テスト名パターンで絞り込み
- `a` - 全テストを実行
- `f` - 失敗したテストだけを実行

## プロジェクトでの絞り込み

特定の project を実行する:

```bash
vitest --project unit
vitest --project integration --project e2e
```

## 環境による絞り込み

```ts
const isDev = process.env.NODE_ENV === 'development'
const isCI = process.env.CI

describe.skipIf(isCI)('local only tests', () => {})
describe.runIf(isDev)('dev tests', () => {})
```

## フィルタの組み合わせ

```bash
# ファイルパターン + テスト名 + 変更
vitest user -t "login" --changed

# 関連ファイル + run モード
vitest related src/auth.ts --run
```

## 実行せずに一覧表示

```bash
vitest list                 # 全テスト名を表示
vitest list -t "user"       # 名前で絞り込み
vitest list --filesOnly     # ファイルパスのみ表示
vitest list --json          # JSON 出力
```

## 要点

- テスト名パターンの絞り込みには `-t` を使う
- `--changed` は変更の影響を受けるテストのみを実行する
- `--related` は特定のファイルを import するテストを実行する
- タグは意味のある単位でテストをグループ化する
- デバッグ用途には `.only` を使い、CI では拒否する設定にする
- watch モードでは対話的に絞り込める

<!-- 
Source references:
- https://vitest.dev/guide/filtering.html
- https://vitest.dev/guide/cli.html
-->
