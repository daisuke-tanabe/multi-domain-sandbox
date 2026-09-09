---
name: typescript-coding-style
description: TypeScript / JavaScript のコーディング規約と型設計ルール。型安全 (`unknown` 優先・`any` 禁止)、イミュータビリティ、判別ユニオン、ブランド型、Result 型でのエラー表現、命名規約、async/await の並列化、`import type`、名前付きエクスポート、type-fest 活用などをプロジェクト全体で統一する。.ts / .tsx / .js / .jsx ファイルを書く・編集する作業、TypeScript / JavaScript のコードレビュー・リファクタ・型設計、`unknown` / `any` / `interface` vs `type` / `Result` / 判別ユニオン / `as` キャスト / バレル / `default export` / 並列 await / `Readonly` / `Opaque` / `never` チェックといったテーマが出てきたときは、たとえユーザーが「規約」と明言しなくても必ず参照する。
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.cjs"
---

# TypeScript / JavaScript コーディングスタイル

このプロジェクトの TypeScript / JavaScript コードを書く・読む・レビューするときに参照する規約。
.ts / .tsx / .js / .jsx を編集するときは必ず守る。

## 何を見るか

| やりたいこと | 参照するリファレンス |
|---|---|
| 変数宣言・反復処理・async/await・エラー処理・エクスポート・コメント等の書き方 | `references/coding-style.md` |
| `interface` vs `type`、判別ユニオン、ブランド型、type predicate / assertion、`never` チェック、`readonly`、type-fest 活用 | `references/type-design.md` |

両方をひと通り把握しておくと、コードを書くたびにファイルを開かずに判断できる。
迷ったら該当リファレンスを開く。

## 主要原則

このプロジェクトの規約は、ひとことで言えば「型システムに不正な状態を表現させない」。
そのために以下の柱がある。

### 1. 型安全 — `unknown` を優先、`any` を禁止

外部・信頼できない入力は `unknown` で受け、type predicate (`value is T`) で絞り込む。
`any` と `as` キャストは実行時の保証なしに型システムを欺くだけなので避ける。
詳細は `references/type-design.md` の「`any` の代わりに `unknown`」「型ガードと assertion で安全にナローイング」。

### 2. イミュータブルがデフォルト

`const` 優先、再代入が必要なときだけ `let`。関数引数は `Readonly<T>` / `ReadonlyArray<T>` で受け、
更新は新オブジェクトを返す (スプレッド)。詳細は `references/coding-style.md` の「変数宣言は const を使う」「イミュータビリティ」。

### 3. 不正な状態を型で表現不可にする

`{ loading: boolean; data: T | null; error: Error | null }` のように真偽値とフィールドの組み合わせで
矛盾状態を許す代わりに、判別ユニオンで「必要なフィールドの組み合わせ」を強制する。
詳細は `references/type-design.md` の「判別ユニオン型」。

### 4. 回復可能なエラーは Result 型、真の異常だけ throw

バリデーション失敗・外部 API エラー等の予期できる失敗は `Result<T, E>` で返し、
呼び出し側に `if (!result.ok) return ...` を強制する。
予期しないバグや回復不能な状態だけを throw し、catch 側は `unknown` として受けて安全に絞り込む。
詳細は `references/coding-style.md` の「エラーハンドリング」。

### 5. 命名・エクスポートの規律

- 名前付き export を使う (`export *` ワイルドカードバレルや `export default` を避ける)
- 型のみの import は `import type` で明示する
- パブリック API (エクスポート関数・公開メソッド) は引数と戻り値の型を明示する

詳細は `references/coding-style.md` の「エクスポート」「import type 構文」「パブリック API の型注釈」。

### 6. 反復・async は意図に応じて選ぶ

純粋な変換・絞り込み・集計は配列メソッド (`map` / `filter` / `reduce` 等)、
副作用や `await` を伴う直列処理は `for...of`。独立した非同期処理は `Promise.all` で並列化する。
詳細は `references/coding-style.md` の「反復処理は意図に応じて選ぶ」「Async/Await」。

## 使い方の流れ

コードを書く・編集するとき:

1. SKILL.md (この本文) で関連する原則を確認する
2. 詳細が必要なら該当する `references/*.md` を開く
3. 既存ファイルの書き方と矛盾するときはリファレンスのほうを正としてリファクタを提案する

レビューするとき:

1. リファレンスのアンチパターン例 (Bad / Good) と照合する
2. 違反があれば、なぜそうすべきか (リファレンスの「なぜ」) と一緒に指摘する

## このスキルが扱わないこと

- React / Next.js / Hono など特定フレームワーク固有のパターン
- テストの書き方
- アクセシビリティ・SEO・セキュリティ等の横断的観点

これらは TypeScript の規約とは独立して評価し、衝突する場合は文脈に応じて判断する。
