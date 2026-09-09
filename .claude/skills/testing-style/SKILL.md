---
name: testing-style
description: フレームワーク非依存のテスト構造（AAA パターン）とテスト命名規範。Vitest / Jest / Playwright など使用ライブラリを問わず、すべてのテストファイルに共通で適用される。`.test.ts` / `.test.tsx` / `.spec.ts` / `.spec.tsx` / `.test.js` / `.test.jsx` / `.spec.js` / `.spec.jsx` のテストコードを作成・修正・レビューする際は必ず本スキルを参照する。テストを書き始める前、テスト名を決める段階、既存テストをリファクタリングする時にも適用する。
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
  - "**/*.test.js"
  - "**/*.test.jsx"
  - "**/*.spec.js"
  - "**/*.spec.jsx"
---

# テストスタイル

テストフレームワークに依存しない、テストの書き方の方針をまとめる。Vitest / Jest / Playwright などの選定とは独立して、すべてのテストファイルに適用される共通規範。

## テストの種類

テストは目的別に以下のレイヤーに分ける。レイヤーが違えば検証する関心も粒度も違うため、混在させると失敗時の原因切り分けが難しくなる。

- ユニット・統合テスト: 関数・モジュール単位で振る舞いを検証する
- E2E テスト: クリティカルなユーザーフローを検証する

## テスト構造（AAA パターン）

Arrange / Act / Assert の 3 ブロックを明示的に分け、何を準備し、何を実行し、何を検証しているかを読み取れるようにする。コメントでブロック境界を示すことで、テストを読む人が「準備が膨らんだのか」「実行対象が複数あるのか」「検証が散らばっているのか」を一目で判別できる。

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

## テスト名

期待する振る舞いと境界条件が伝わる説明的な名前にする。テスト名だけで「何が起きるか」「どんな前提か」がわかれば、失敗ログを見た瞬間に原因の見当がつく。逆に `works` のような名前は、失敗時にテスト本体を読まないと何が壊れたのか判らず、調査コストが跳ね上がる。

```typescript
// Good: 説明的なテスト名
test('returns empty array when no markets match query', () => { })
test('throws error when OpenAI API key is missing', () => { })
test('falls back to substring search when Redis unavailable', () => { })

// Bad: 曖昧なテスト名
test('works', () => { })
test('test search', () => { })
```
