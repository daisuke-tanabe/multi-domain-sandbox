# テクニカル SEO チェックリスト

コンテンツ最適化の前に技術的な障害を解消する。クロール／インデックスが正しく動かないと、どれだけ良いコンテンツを書いても検索結果に出てこない。

## クロール可能性

- `robots.txt` は重要なページを許可し、価値の低い領域をブロックすること
- 重要なページが意図せず `noindex` になっていないこと
- 重要なページは浅いクリック深度で到達可能であること
- 2 ホップを超えるリダイレクトチェーンを避けること
- canonical タグは自己整合的かつループしないこと

## インデックス可能性

- 推奨 URL 形式が一貫していること
- 多言語ページでは hreflang を使う場合は正しく設定すること
- サイトマップは公開対象を反映していること
- canonical 制御なしに重複 URL が競合しないこと

## パフォーマンス（Core Web Vitals）

| 指標 | 目標 |
|---|---|
| LCP（Largest Contentful Paint） | < 2.5s |
| INP（Interaction to Next Paint） | < 200ms |
| CLS（Cumulative Layout Shift） | < 0.1 |

一般的な対処:
- ヒーロー画像のプリロード（`<link rel="preload" as="image">`）
- レンダーブロッキング JS / CSS の削減
- レイアウト領域の事前確保（width / height 属性、CSS の aspect-ratio）
- 重い JS の遅延読み込み・コード分割

## 構造化データ

| ページ種別 | 推奨スキーマ |
|---|---|
| ホームページ | `Organization` または `LocalBusiness`（適切なら） |
| 編集系ページ | `Article` / `BlogPosting` |
| 商品ページ | `Product` + `Offer` |
| 内部ページ | `BreadcrumbList` |
| Q&A セクション | `FAQPage`（内容が本当に一致する場合のみ） |

スキーマは 実態に一致させる。実在しないコンテンツに対して `FAQPage` や `Review` を貼ると、Search Console で警告 / ペナルティ対象になる。
