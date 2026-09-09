---
name: snapshot-testing
description: ファイル、インライン、ファイルスナップショットによるスナップショットテスト
---

# スナップショットテスト

スナップショットテストでは出力をキャプチャし、保存された参照と比較する。

## 基本のスナップショット

```ts
import { expect, test } from 'vitest'

test('snapshot', () => {
  const result = generateOutput()
  expect(result).toMatchSnapshot()
})
```

初回実行時に `.snap` ファイルが作成される:

```js
// __snapshots__/test.spec.ts.snap
exports['snapshot 1'] = `
{
  "id": 1,
  "name": "test"
}
`
```

## インラインスナップショット

テストファイル内に直接保存される:

```ts
test('inline snapshot', () => {
  const data = { foo: 'bar' }
  expect(data).toMatchInlineSnapshot()
})
```

Vitest がテストファイルを更新する:

```ts
test('inline snapshot', () => {
  const data = { foo: 'bar' }
  expect(data).toMatchInlineSnapshot(`
    {
      "foo": "bar",
    }
  `)
})
```

## ファイルスナップショット

明示的なファイルと比較する:

```ts
test('render html', async () => {
  const html = renderComponent()
  await expect(html).toMatchFileSnapshot('./expected/component.html')
})
```

## スナップショットのヒント

説明的なヒントを追加できる:

```ts
test('multiple snapshots', () => {
  expect(header).toMatchSnapshot('header')
  expect(body).toMatchSnapshot('body content')
  expect(footer).toMatchSnapshot('footer')
})
```

## オブジェクト形状のマッチング

部分構造でマッチする:

```ts
test('shape snapshot', () => {
  const data = { 
    id: Math.random(), 
    created: new Date(),
    name: 'test' 
  }
  
  expect(data).toMatchSnapshot({
    id: expect.any(Number),
    created: expect.any(Date),
  })
})
```

## エラーのスナップショット

```ts
test('error message', () => {
  expect(() => {
    throw new Error('Something went wrong')
  }).toThrowErrorMatchingSnapshot()
})

test('inline error', () => {
  expect(() => {
    throw new Error('Bad input')
  }).toThrowErrorMatchingInlineSnapshot(`[Error: Bad input]`)
})
```

## スナップショットの更新

```bash
# すべてのスナップショットを更新
vitest -u
vitest --update

# watch モードでは 'u' を押すと失敗したスナップショットを更新
```

CI (`process.env.CI`) では Vitest はスナップショットを一切書き込まない。不一致、欠落したスナップショット、どのテストにもマッチしない obsolete なスナップショットはすべて実行を失敗させる。

## Visual と ARIA スナップショット (Browser Mode)

```ts
import { expect, test } from 'vitest'
import { page } from 'vitest/browser' // v4: 'vitest/browser' から import する

test('button looks correct', async () => {
  await expect(page.getByRole('button')).toMatchScreenshot('primary-button')
})

// ARIA スナップショット — アクセシビリティツリーをアサートする (4.1+、experimental)
test('nav structure', async () => {
  await expect.element(page.getByRole('navigation')).toMatchAriaInlineSnapshot(`
    - navigation "Main":
      - link "Home"
  `)
})
```

## カスタムスナップショット matcher (4.1+)

`vitest` から export される合成可能な `Snapshots` ヘルパーの上に matcher を構築する。`jest-snapshot` からの import を置き換えるものである:

```ts
import { expect, Snapshots } from 'vitest'

const { toMatchSnapshot, toMatchInlineSnapshot } = Snapshots

expect.extend({
  toMatchTrimmedSnapshot(received: string, length: number) {
    return toMatchSnapshot.call(this, received.slice(0, length))
  },
  toMatchTrimmedInlineSnapshot(received: string, inlineSnapshot?: string) {
    return toMatchInlineSnapshot.call(this, received.slice(0, 10), inlineSnapshot)
  },
})
```

インラインスナップショット文字列は必ず最後の引数にする。ファイルスナップショットの matcher は `async` にする必要がある。

## カスタムシリアライザー

スナップショットのフォーマットをカスタマイズする:

```ts
expect.addSnapshotSerializer({
  test(val) {
    return val && typeof val.toJSON === 'function'
  },
  serialize(val, config, indentation, depth, refs, printer) {
    return printer(val.toJSON(), config, indentation, depth, refs)
  },
})
```

config 経由でも指定可能:

```ts
// vitest.config.ts
defineConfig({
  test: {
    snapshotSerializers: ['./my-serializer.ts'],
  },
})
```

## スナップショットのフォーマットオプション

```ts
defineConfig({
  test: {
    snapshotFormat: {
      printBasicPrototype: false, // Array / Object のプロトタイプを出力しない (Vitest のデフォルト)
      escapeString: false,
      printShadowRoot: true,      // v4 デフォルト: カスタム要素は shadow root を出力する
    },
  },
})
```

## Concurrent テストのスナップショット

context の expect を使う:

```ts
test.concurrent('concurrent 1', async ({ expect }) => {
  expect(await getData()).toMatchSnapshot()
})

test.concurrent('concurrent 2', async ({ expect }) => {
  expect(await getOther()).toMatchSnapshot()
})
```

## スナップショットファイルの場所

デフォルト: `__snapshots__/<test-file>.snap`

カスタマイズ:

```ts
defineConfig({
  test: {
    resolveSnapshotPath: (testPath, snapExtension) => {
      return testPath.replace('__tests__', '__snapshots__') + snapExtension
    },
  },
})
```

## 要点

- スナップショットファイルはバージョン管理にコミットする
- コードレビューでスナップショットの変更を確認する
- 1 つのテストで複数のスナップショットを使うときはヒントを付ける
- 大きな出力 (HTML、JSON) には `toMatchFileSnapshot` を使う
- インラインスナップショットはテストファイル内で自動更新される
- concurrent テストでは context の `expect` を使う
- CI は obsolete なスナップショットで失敗する。`--update` でクリーンアップする
- v4 はカスタム要素の shadow root を出力する。無効化するには `snapshotFormat.printShadowRoot: false` を設定する

<!-- 
Source references:
- https://vitest.dev/guide/snapshot.html
- https://vitest.dev/api/expect.html#tomatchsnapshot
- https://vitest.dev/guide/browser/aria-snapshots
-->
