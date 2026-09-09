---
name: vercel-react-best-practices
description: Vercel Engineering による React と Next.js のパフォーマンス最適化ガイドライン。React/Next.js コードの記述・レビュー・リファクタリングを行う際に、最適なパフォーマンスパターンを担保するため本スキルを利用する。React コンポーネント、Next.js のページ、データ取得、バンドル最適化、パフォーマンス改善に関わるタスクで発火する。
license: MIT
metadata:
  source: "vercel-labs/agent-skills@skills/react-best-practices"
  sourceVersion: "dc8367e6f91c022d83361f03c3313fa05e848ee5"
  author: vercel
  version: "1.0.0"
---

# Vercel React Best Practices

Vercel がメンテナンスする、React および Next.js アプリケーション向けの包括的なパフォーマンス最適化ガイド。自動リファクタリングとコード生成を導くため、8 カテゴリにわたる 70 のルールを影響度順に整理している。

## 適用タイミング

以下の場面で本ガイドラインを参照する:
- 新しい React コンポーネントや Next.js ページを書くとき
- データ取得を実装するとき（クライアント／サーバーサイド）
- パフォーマンスの観点でコードレビューを行うとき
- 既存の React/Next.js コードをリファクタリングするとき
- バンドルサイズやロード時間を最適化するとき

## 優先度別ルールカテゴリ

| 優先度 | カテゴリ | 影響度 | プレフィックス |
|----------|----------|--------|--------|
| 1 | ウォーターフォールの排除 | CRITICAL | `async-` |
| 2 | バンドルサイズ最適化 | CRITICAL | `bundle-` |
| 3 | サーバーサイドパフォーマンス | HIGH | `server-` |
| 4 | クライアントサイドのデータ取得 | MEDIUM-HIGH | `client-` |
| 5 | 再レンダリング最適化 | MEDIUM | `rerender-` |
| 6 | レンダリングパフォーマンス | MEDIUM | `rendering-` |
| 7 | JavaScript パフォーマンス | LOW-MEDIUM | `js-` |
| 8 | 高度なパターン | LOW | `advanced-` |

## クイックリファレンス

### 1. ウォーターフォールの排除 (CRITICAL)

- `async-cheap-condition-before-await` - フラグやリモート値を await する前に、安価な同期条件で短絡する
- `async-defer-await` - await を実際に使うブランチへ移動する
- `async-parallel` - 独立した操作には Promise.all() を使う
- `async-dependencies` - 部分的な依存関係には better-all を使う
- `async-api-routes` - API ルートでは Promise を早く開始し await は遅らせる
- `async-suspense-boundaries` - Suspense でコンテンツをストリームする

### 2. バンドルサイズ最適化 (CRITICAL)

- `bundle-barrel-imports` - 直接 import し、バレルファイルを避ける
- `bundle-analyzable-paths` - 静的に解析可能な import とファイルシステムパスを優先し、過剰なバンドルとトレースを避ける
- `bundle-dynamic-imports` - 重いコンポーネントには next/dynamic を使う
- `bundle-defer-third-party` - 計測やロギングは hydration 後に読み込む
- `bundle-conditional` - モジュールは機能が有効化されたときだけ読み込む
- `bundle-preload` - 体感速度向上のため hover/focus で preload する

### 3. サーバーサイドパフォーマンス (HIGH)

- `server-auth-actions` - server actions も API ルートと同様に認証する
- `server-cache-react` - リクエスト単位の重複排除に React.cache() を使う
- `server-cache-lru` - リクエストをまたぐキャッシュには LRU キャッシュを使う
- `server-dedup-props` - RSC props における重複シリアライズを避ける
- `server-hoist-static-io` - 静的な I/O（フォント・ロゴ等）はモジュールレベルに巻き上げる
- `server-no-shared-module-state` - RSC/SSR でモジュールレベルの可変リクエスト状態を持たない
- `server-serialization` - client component に渡すデータを最小化する
- `server-parallel-fetching` - コンポーネントを再構成して fetch を並列化する
- `server-parallel-nested-fetching` - アイテムごとのネストした fetch を Promise.all で連結する
- `server-after-nonblocking` - 非ブロッキング処理には after() を使う

### 4. クライアントサイドのデータ取得 (MEDIUM-HIGH)

- `client-swr-dedup` - リクエストの自動重複排除に SWR を使う
- `client-event-listeners` - グローバルなイベントリスナーを重複排除する
- `client-passive-event-listeners` - スクロール用には passive listener を使う
- `client-localstorage-schema` - localStorage のデータをバージョン管理し最小化する

### 5. 再レンダリング最適化 (MEDIUM)

- `rerender-defer-reads` - コールバック内でしか使わない状態を subscribe しない
- `rerender-memo` - 高コストな処理を memo 化されたコンポーネントに切り出す
- `rerender-memo-with-default-value` - 非プリミティブなデフォルト props を巻き上げる
- `rerender-dependencies` - effect の依存にはプリミティブを使う
- `rerender-derived-state` - 派生 boolean を subscribe し、生の値は subscribe しない
- `rerender-derived-state-no-effect` - 派生状態は effect ではなくレンダリング中に算出する
- `rerender-functional-setstate` - 安定したコールバックのため functional setState を使う
- `rerender-lazy-state-init` - 高コストな初期値は useState に関数を渡す
- `rerender-simple-expression-in-memo` - プリミティブを返す単純な式は memo しない
- `rerender-split-combined-hooks` - 依存関係が独立した hook は分割する
- `rerender-move-effect-to-event` - 操作に伴うロジックはイベントハンドラへ移す
- `rerender-transitions` - 緊急でない更新には startTransition を使う
- `rerender-use-deferred-value` - 入力の応答性を保つため高コストなレンダーは defer する
- `rerender-use-ref-transient-values` - 頻繁に変わる一時値には ref を使う
- `rerender-no-inline-components` - コンポーネント内でコンポーネントを定義しない

### 6. レンダリングパフォーマンス (MEDIUM)

- `rendering-animate-svg-wrapper` - SVG 要素ではなくラッパー div をアニメーションする
- `rendering-content-visibility` - 長いリストには content-visibility を使う
- `rendering-hoist-jsx` - 静的な JSX はコンポーネント外に切り出す
- `rendering-svg-precision` - SVG 座標の精度を下げる
- `rendering-hydration-no-flicker` - クライアント限定データはインラインスクリプトで扱う
- `rendering-hydration-suppress-warning` - 想定内の不一致は警告を抑制する
- `rendering-activity` - 表示／非表示には Activity コンポーネントを使う
- `rendering-conditional-render` - 条件分岐には && ではなく三項演算子を使う
- `rendering-usetransition-loading` - ローディング状態には useTransition を優先する
- `rendering-resource-hints` - preload には React DOM のリソースヒントを使う
- `rendering-script-defer-async` - script タグには defer か async を付与する

### 7. JavaScript パフォーマンス (LOW-MEDIUM)

- `js-batch-dom-css` - CSS 変更はクラスや cssText でまとめる
- `js-index-maps` - 繰り返し参照には Map を構築する
- `js-cache-property-access` - ループ内ではオブジェクトプロパティをキャッシュする
- `js-cache-function-results` - 関数の結果はモジュールレベルの Map にキャッシュする
- `js-cache-storage` - localStorage/sessionStorage の読み出しをキャッシュする
- `js-combine-iterations` - 複数の filter/map を 1 つのループに統合する
- `js-length-check-first` - 高コストな比較の前に配列長をチェックする
- `js-early-exit` - 関数からは早期 return する
- `js-hoist-regexp` - RegExp の生成はループ外へ巻き上げる
- `js-min-max-loop` - min/max には sort ではなくループを使う
- `js-set-map-lookups` - O(1) の探索には Set/Map を使う
- `js-tosorted-immutable` - イミュータブル化には toSorted() を使う
- `js-flatmap-filter` - map と filter を一度に行うには flatMap を使う
- `js-request-idle-callback` - クリティカルでない処理はブラウザのアイドル時間に defer する

### 8. 高度なパターン (LOW)

- `advanced-effect-event-deps` - `useEffectEvent` の戻り値を effect の依存に入れない
- `advanced-event-handler-refs` - イベントハンドラは ref に格納する
- `advanced-init-once` - アプリ起動ごとに 1 回だけ初期化する
- `advanced-use-latest` - 安定したコールバック ref のために useLatest を使う

## 使い方

詳細な解説とコード例は個別のルールファイルを参照する:

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
```

各ルールファイルには以下が含まれる:
- なぜ重要かの簡単な説明
- 誤ったコード例とその解説
- 正しいコード例とその解説
- 追加のコンテキストと参考リンク

## 全ルールをまとめたドキュメント

すべてのルールを展開した完全ガイドは `AGENTS.md` を参照する。
