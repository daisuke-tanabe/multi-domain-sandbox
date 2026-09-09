# Customization と Theming

コンポーネントはセマンティックな CSS 変数トークンを参照する。変数を変更すれば、それを参照するすべてのコンポーネントが変わる。

## 目次

- 仕組み (CSS 変数 → Tailwind ユーティリティ → コンポーネント)
- カラー変数と OKLCH フォーマット
- ダークモードのセットアップ
- テーマの変更 (preset、CSS 変数)
- カスタムカラーの追加 (Tailwind v3 / v4)
- ボーダー半径
- コンポーネントのカスタマイズ (variant、className、ラッパー)
- 更新の確認

---

## 仕組み

1. `:root` (ライト) と `.dark` (ダークモード) で CSS 変数を定義する。
2. Tailwind がそれを `bg-primary`、`text-muted-foreground` などのユーティリティへマッピングする。
3. コンポーネントはそれらのユーティリティを使う — 変数を変更すると、それを参照するすべてのコンポーネントが変わる。

---

## カラー変数

すべてのカラーは `name` / `name-foreground` という命名規則に従う。ベースの変数は背景用、`-foreground` はその背景上のテキスト/アイコン用。

| 変数                                         | 用途                              |
| -------------------------------------------- | --------------------------------- |
| `--background` / `--foreground`              | ページの背景とデフォルトテキスト  |
| `--card` / `--card-foreground`               | Card のサーフェス                 |
| `--primary` / `--primary-foreground`         | プライマリのボタンやアクション    |
| `--secondary` / `--secondary-foreground`     | セカンダリのアクション            |
| `--muted` / `--muted-foreground`             | 弱め/無効状態                     |
| `--accent` / `--accent-foreground`           | ホバーやアクセント状態            |
| `--destructive` / `--destructive-foreground` | エラーや破壊的アクション          |
| `--border`                                   | デフォルトのボーダーカラー        |
| `--input`                                    | フォーム入力のボーダー            |
| `--ring`                                     | フォーカスリングのカラー          |
| `--chart-1` から `--chart-5`                 | チャート/データ可視化             |
| `--sidebar-*`                                | Sidebar 専用のカラー              |
| `--surface` / `--surface-foreground`         | セカンダリサーフェス              |

カラーは OKLCH を使う: `--primary: oklch(0.205 0 0)` の値は明度 (0〜1)、彩度 (0 = グレー)、色相 (0〜360)。

---

## ダークモード

ルート要素の `.dark` クラスによるトグル方式。Next.js では `next-themes` を使う。

```tsx
import { ThemeProvider } from "next-themes"

<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>
```

---

## テーマの変更

```bash
# ui.shadcn.com から preset コードを適用する。
npx shadcn@latest apply --preset a2r6bw

# 位置引数の省略形も使える。
npx shadcn@latest apply a2r6bw

# named preset に切り替えて既存コンポーネントを上書きする。
npx shadcn@latest apply --preset nova

# 既存コンポーネントを保つ場合。
npx shadcn@latest init --preset nova --force --no-reinstall

# カスタムテーマ URL を使う。
npx shadcn@latest apply --preset "https://ui.shadcn.com/init?base=radix&style=nova&theme=blue&..."
```

または `globals.css` の CSS 変数を直接編集する。

---

## カスタムカラーの追加

`npx shadcn@latest info` で得られる `tailwindCssFile` のファイル (通常 `globals.css`) に変数を追加する。これ用に新しい CSS ファイルを作らない。

```css
/* 1. グローバル CSS ファイルで定義する。 */
:root {
  --warning: oklch(0.84 0.16 84);
  --warning-foreground: oklch(0.28 0.07 46);
}
.dark {
  --warning: oklch(0.41 0.11 46);
  --warning-foreground: oklch(0.99 0.02 95);
}
```

```css
/* 2a. Tailwind v4 に登録する (@theme inline)。 */
@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```

`tailwindVersion` が `"v3"` のとき (`npx shadcn@latest info` で確認) は、代わりに `tailwind.config.js` に登録する。

```js
// 2b. Tailwind v3 に登録する (tailwind.config.js)。
module.exports = {
  theme: {
    extend: {
      colors: {
        warning: "oklch(var(--warning) / <alpha-value>)",
        "warning-foreground":
          "oklch(var(--warning-foreground) / <alpha-value>)",
      },
    },
  },
}
```

```tsx
// 3. コンポーネントで使う。
<div className="bg-warning text-warning-foreground">Warning</div>
```

---

## ボーダー半径

`--radius` はボーダー半径をグローバルに制御する。コンポーネントはこれを基に値を導出する (`rounded-lg` = `var(--radius)`、`rounded-md` = `calc(var(--radius) - 2px)`)。

---

## コンポーネントのカスタマイズ

参考: [rules/styling.md](./rules/styling.md) に Incorrect/Correct の例がある。

以下の順で優先する。

### 1. 組み込み variant

```tsx
<Button variant="outline" size="sm">
  Click
</Button>
```

### 2. `className` 経由の Tailwind クラス

```tsx
<Card className="mx-auto max-w-md">...</Card>
```

### 3. 新しい variant を追加する

コンポーネントのソースを編集し、`cva` で variant を追加する。

```tsx
// components/ui/button.tsx
warning: "bg-warning text-warning-foreground hover:bg-warning/90",
```

### 4. ラッパーコンポーネント

shadcn/ui のプリミティブを組み合わせて、より高レベルのコンポーネントを作る。

```tsx
export function ConfirmDialog({ title, description, onConfirm, children }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

---

## 更新の確認

```bash
npx shadcn@latest add button --diff
```

更新前に何が変わるかを正確にプレビューしたい場合は、`--dry-run` と `--diff` を使う。

```bash
npx shadcn@latest add button --dry-run        # 影響するファイルをすべて確認
npx shadcn@latest add button --diff button.tsx # 特定ファイルの diff を確認
```

完全な smart merge ワークフローは [SKILL.md のコンポーネント更新](./SKILL.md#コンポーネントの更新) を参照。
