# Web (HTML / WAI-ARIA) アクセシビリティ実装

ネイティブ HTML 要素を最優先し、必要な場合のみ ARIA で意味を補強する。`role` を付ければ完了ではなく、対応するキーボード操作・フォーカス管理・状態更新もセットで実装する。

## ラベリング属性の使い分け

| 機能 | 属性 |
|---|---|
| 主要ラベル | `aria-label` または `<label for=...>` |
| 補助ヒント | `aria-describedby` |
| アクションロール | `role="button"` 等（ネイティブ要素を使えない場合のみ） |
| ライブ更新 | `aria-live="polite"` / `aria-live="assertive"` |

## アクセシブルな検索フォーム

```html
<form role="search">
  <label for="search-input" class="sr-only">Search products</label>
  <input type="search" id="search-input" placeholder="Search..." />
  <button type="submit" aria-label="Submit Search">
    <svg aria-hidden="true">...</svg>
  </button>
</form>
```

ポイント:
- `role="search"` でランドマークとして識別
- `<label class="sr-only">` で視覚的に隠しつつスクリーンリーダー向けにはラベル提供
- アイコンのみのボタンは `aria-label` で意図を明示
- 装飾用 SVG は `aria-hidden="true"` でアクセシビリティツリーから除外

## モーダルダイアログ

- `role="dialog"` + `aria-modal="true"`
- 開いた瞬間にダイアログ内へフォーカスを移動
- フォーカスをダイアログ内に トラップ し、Tab / Shift+Tab で外に出ない
- `Escape` キーで閉じ、開く前のトリガー要素にフォーカスを戻す（WCAG SC 2.1.2）

## ライブリージョン

非同期な状態変化（フォームの送信結果、検索ヒット数の更新等）は `aria-live` で告知する:

```html
<div aria-live="polite" aria-atomic="true">
  <span id="search-status">5 件の結果</span>
</div>
```

- `polite`: 現在の読み上げを邪魔しない（推奨デフォルト）
- `assertive`: 即座に割り込む（エラーや重大通知のみ）

## 参考資料

- [WCAG 2.2 Guidelines](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/TR/wai-aria-practices/)
