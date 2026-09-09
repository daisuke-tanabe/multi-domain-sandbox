# Styling と Customization

テーマ、CSS 変数、カスタムカラーの追加については [customization.md](../customization.md) を参照。

## 目次

- セマンティックカラー
- 組み込み variant を優先
- className はレイアウトのみ
- space-x-* / space-y-* を使わない
- 幅と高さが等しい場合は w-* h-* より size-* を使う
- truncate ショートハンドを優先
- dark: の手動カラー上書きをしない
- 条件付きクラスには cn() を使う
- オーバーレイ系コンポーネントに手動 z-index を付けない
- shimmer / scroll-fade ユーティリティを使い、カスタムアニメーションを書かない

---

## セマンティックカラー

Incorrect:

```tsx
<div className="bg-blue-500 text-white">
  <p className="text-gray-600">Secondary text</p>
</div>
```

Correct:

```tsx
<div className="bg-primary text-primary-foreground">
  <p className="text-muted-foreground">Secondary text</p>
</div>
```

---

## ステータス/状態表示に生のカラー値を使わない

ポジティブ・ネガティブ・ステータスのインジケータには、Badge の variant、`text-destructive` のようなセマンティックトークン、もしくはカスタム CSS 変数を使う — 生の Tailwind カラーに手を伸ばさない。

Incorrect:

```tsx
<span className="text-emerald-600">+20.1%</span>
<span className="text-green-500">Active</span>
<span className="text-red-600">-3.2%</span>
```

Correct:

```tsx
<Badge variant="secondary">+20.1%</Badge>
<Badge>Active</Badge>
<span className="text-destructive">-3.2%</span>
```

セマンティックトークンとして存在しない成功/ポジティブカラーが必要な場合は、Badge の variant を使うか、テーマにカスタム CSS 変数を追加するかをユーザーに確認する ([customization.md](../customization.md) を参照)。

---

## 組み込み variant を優先

Incorrect:

```tsx
<Button className="border border-input bg-transparent hover:bg-accent">
  Click me
</Button>
```

Correct:

```tsx
<Button variant="outline">Click me</Button>
```

---

## className はレイアウトのみ

`className` はレイアウト (例: `max-w-md`、`mx-auto`、`mt-4`) のために使う。コンポーネントの色や typography を上書きするためには使わない。色を変えたい場合はセマンティックトークン、組み込み variant、CSS 変数を使う。

Incorrect:

```tsx
<Card className="bg-blue-100 text-blue-900 font-bold">
  <CardContent>Dashboard</CardContent>
</Card>
```

Correct:

```tsx
<Card className="max-w-md mx-auto">
  <CardContent>Dashboard</CardContent>
</Card>
```

コンポーネントの見た目をカスタマイズするには、以下の順で優先する。
1. 組み込み variant — `variant="outline"`、`variant="destructive"` など。
2. セマンティックなカラートークン — `bg-primary`、`text-muted-foreground`。
3. CSS 変数 — グローバル CSS ファイルでカスタムカラーを定義 ([customization.md](../customization.md) を参照)。

---

## space-x-* / space-y-* を使わない

代わりに `gap-*` を使う。`space-y-4` → `flex flex-col gap-4`。`space-x-2` → `flex gap-2`。

```tsx
<div className="flex flex-col gap-4">
  <Input />
  <Input />
  <Button>Submit</Button>
</div>
```

---

## 幅と高さが等しい場合は w-* h-* より size-* を使う

`w-10 h-10` ではなく `size-10`。アイコン、Avatar、Skeleton などに当てはまる。

---

## truncate ショートハンドを優先

`overflow-hidden text-ellipsis whitespace-nowrap` ではなく `truncate` を使う。

---

## dark: の手動カラー上書きをしない

セマンティックトークンを使う — CSS 変数経由でライト/ダークが扱われる。`bg-white dark:bg-gray-950` ではなく `bg-background text-foreground` を使う。

---

## 条件付きクラスには cn() を使う

条件付きやマージされたクラス名にはプロジェクトの `cn()` ユーティリティを使う。className 文字列内に三項演算を手書きしない。

Incorrect:

```tsx
<div className={`flex items-center ${isActive ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
```

Correct:

```tsx
import { cn } from "@/lib/utils"

<div className={cn("flex items-center", isActive ? "bg-primary text-primary-foreground" : "bg-muted")}>
```

---

## オーバーレイ系コンポーネントに手動 z-index を付けない

`Dialog`、`Sheet`、`Drawer`、`AlertDialog`、`DropdownMenu`、`Popover`、`Tooltip`、`HoverCard` は自前で重なり順を扱う。`z-50` や `z-[999]` を付けない。

---

## shimmer / scroll-fade ユーティリティを使い、カスタムアニメーションを書かない

「thinking…」のようなライブ表示やローディングテキストのシマーには `shimmer` ユーティリティを使う。カスタムの `@keyframes` や `bg-clip-text` のグラデーションスイープを自作しない。

スクロールコンテナのスクロール連動エッジフェードには `scroll-fade` を使う。軸別のバリアントは `scroll-fade-x` と `scroll-fade-b`。マスクグラデーションを手作りしない。チャットコンポーネントは内部で既にこれらを適用している。`Attachment` はアップロード中にタイトルをシマー表示し、`MessageScrollerViewport` はエッジをフェードする。

Incorrect:

```tsx
<span className="animate-pulse bg-gradient-to-r from-muted-foreground/40 via-foreground/70 to-muted-foreground/40 bg-clip-text text-transparent [animation:shimmer_1.6s_infinite]">
  Thinking…
</span>
```

Correct:

```tsx
<span className="shimmer">Thinking…</span>
```
