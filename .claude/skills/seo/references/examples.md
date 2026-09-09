# 例（title / meta / JSON-LD / 監査出力フォーマット）

## title の式

```text
Primary Topic - Specific Modifier | Brand
```

例:
- `アクセシブルなフォーム設計 - WCAG 2.2 完全ガイド | Example Co.`
- `React フォームバリデーション - Zod 統合パターン | Example Co.`

## meta description の式

```text
Action + topic + value proposition + one supporting detail
```

例:
- `WCAG 2.2 に準拠したフォームを 30 分で構築する。実装可能なコード例と、よくある罠の回避策を含む。`

## JSON-LD（Article 例）

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Page Title Here",
  "author": {
    "@type": "Person",
    "name": "Author Name"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Brand Name"
  }
}
```

複数のエンティティを 1 ページで宣言する場合は `@graph` で結合する:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Article", ... },
    { "@type": "BreadcrumbList", ... }
  ]
}
```

## 監査出力フォーマット

監査結果は 重大度 + 場所 + 問題 + 修正案 を 1 セットで出力する。汎用的な「SEO を改善せよ」では実装に落ちないので、必ずページ／アセット単位で具体化する。

```text
[HIGH] Duplicate title tags on product pages
Location: src/routes/products/[slug].tsx
Issue: Dynamic titles collapse to the same default string, which weakens relevance and creates duplicate signals.
Fix: Generate a unique title per product using the product name and primary category.
```

重大度の目安:
- HIGH: インデックス／クロールに直接影響、または順位を大きく下げるリスク
- MEDIUM: 改善で明確な順位向上が期待できるが、即時の損害は小さい
- LOW: ベストプラクティス遵守。優先度低
