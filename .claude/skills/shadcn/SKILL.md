---
name: shadcn
description: shadcn コンポーネントとプロジェクトを管理する — 追加・検索・修正・デバッグ・スタイリング・チャットインターフェースを含む UI のコンポジションをサポート。プロジェクトのコンテキスト、コンポーネントのドキュメント、利用例を提供する。shadcn/ui、component registry、preset、--preset コード、または `components.json` を持つプロジェクトを扱う際に適用される。「shadcn init」「create an app with --preset」「switch to --preset」などのリクエストにもトリガーされる。
user-invocable: false
allowed-tools: Bash(npx shadcn@latest *), Bash(pnpm dlx shadcn@latest *), Bash(bunx --bun shadcn@latest *)
metadata:
  source: "shadcn-ui/ui@skills/shadcn"
  sourceVersion: "6cd3f4c65c361ab6554e06a77e6a0af9cf8b6e37"
---

# shadcn/ui

UI、コンポーネント、デザインシステムを構築するためのフレームワーク。コンポーネントは CLI を介してソースコードとしてユーザーのプロジェクトに追加される。

> 重要: CLI コマンドはすべてプロジェクトの package runner で実行する。プロジェクトの `packageManager` に応じて `npx shadcn@latest`、`pnpm dlx shadcn@latest`、`bunx --bun shadcn@latest` のいずれかを選ぶ。以下の例では `npx shadcn@latest` を使っているが、プロジェクトに合った runner に置き換えること。

## 現在のプロジェクトコンテキスト

```json
!`npx shadcn@latest info --json`
```

上記の JSON にはプロジェクトの設定とインストール済みコンポーネントが含まれる。任意のコンポーネントのドキュメントと例の URL を取得するには `npx shadcn@latest docs <component>` を使う。

## 原則

1. 既存のコンポーネントを優先する。 カスタム UI を書く前に `npx shadcn@latest search` で registry を確認する。コミュニティ registry もチェックする。
2. 再発明せずコンポジションする。 Settings ページ = Tabs + Card + フォームコントロール。Dashboard = Sidebar + Card + Chart + Table。
3. カスタムスタイルより組み込み variant を使う。 `variant="outline"`、`size="sm"` など。
4. セマンティックカラーを使う。 `bg-primary`、`text-muted-foreground` を使い、`bg-blue-500` のような生の値は使わない。

## 重要なルール

これらのルールは 常に強制 される。各項目は Incorrect/Correct のコード例を含むファイルへのリンクを持つ。

### Styling と Tailwind → [styling.md](./rules/styling.md)

- `className` はレイアウト用であり、スタイリング用ではない。 コンポーネントの色や typography を上書きしない。
- `space-x-*` や `space-y-*` を使わない。 `flex` と `gap-*` を使う。縦方向のスタックには `flex flex-col gap-*`。
- 幅と高さが等しい場合は `size-*` を使う。 `w-10 h-10` ではなく `size-10`。
- `truncate` ショートハンドを使う。 `overflow-hidden text-ellipsis whitespace-nowrap` の代わり。
- `dark:` の手動カラー上書きをしない。 セマンティックトークン (`bg-background`、`text-muted-foreground`) を使う。
- 条件付きクラスには `cn()` を使う。 className 内で template literal の三項演算を手書きしない。
- オーバーレイ系コンポーネントに手動で `z-index` を指定しない。 Dialog、Sheet、Popover などは自前で重なり順を管理する。

### Forms と Inputs → [forms.md](./rules/forms.md)

- フォームは `FieldGroup` + `Field` を使う。 フォームレイアウトに生の `div` + `space-y-*` や `grid gap-*` を使わない。
- `InputGroup` は `InputGroupInput`/`InputGroupTextarea` を使う。 `InputGroup` の中で生の `Input`/`Textarea` を使わない。
- 入力内のボタンには `InputGroup` + `InputGroupAddon` を使う。
- 2〜7 個の選択肢の場合は `ToggleGroup` を使う。 `Button` をループしてアクティブ状態を手で管理しない。
- 関連するチェックボックス/ラジオのグループ化には `FieldSet` + `FieldLegend` を使う。 見出し付きの `div` を使わない。
- フィールドのバリデーションは `data-invalid` + `aria-invalid` を使う。 `Field` には `data-invalid`、コントロールには `aria-invalid`。disabled の場合は `Field` に `data-disabled`、コントロールに `disabled`。

### コンポーネント構造 → [composition.md](./rules/composition.md)

- Item は必ず対応する Group の中に置く。 `SelectItem` → `SelectGroup`、`DropdownMenuItem` → `DropdownMenuGroup`、`CommandItem` → `CommandGroup`。
- カスタムトリガーには `asChild` (radix) または `render` (base) を使う。 `npx shadcn@latest info` の `base` フィールドを確認する。→ [base-vs-radix.md](./rules/base-vs-radix.md)
- Dialog、Sheet、Drawer には必ず Title が必要。 アクセシビリティのため `DialogTitle`、`SheetTitle`、`DrawerTitle` は必須。視覚的に隠す場合は `className="sr-only"` を使う。
- Card は完全なコンポジションで使う。 `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter` を使う。すべてを `CardContent` に詰め込まない。
- Button に `isPending`/`isLoading` プロパティはない。 `Spinner` + `data-icon` + `disabled` でコンポジションする。
- `TabsTrigger` は `TabsList` の中に置く。 `Tabs` の直下にトリガーを置かない。
- `Avatar` には必ず `AvatarFallback` が必要。 画像のロードに失敗した場合のため。

### カスタムマークアップではなくコンポーネントを使う → [composition.md](./rules/composition.md)

- カスタムマークアップの前に既存コンポーネントを使う。 スタイル付きの `div` を書く前に同等のコンポーネントが存在しないか確認する。
- コールアウトには `Alert` を使う。 スタイル付きの div を独自に作らない。
- 空状態には `Empty` を使う。 空状態のカスタムマークアップを作らない。
- トーストはプロジェクトの base に従う。Base UI プロジェクトでは `toast` コンポーネントの `toast` を使う。Radix と React Aria プロジェクトでは `sonner` の `toast()` を使う。
- `<hr>` や `<div className="border-t">` の代わりに `Separator` を使う。
- ローディングプレースホルダには `Skeleton` を使う。 独自の `animate-pulse` の div を作らない。
- カスタムスタイルの span の代わりに `Badge` を使う。

### Icons → [icons.md](./rules/icons.md)

- `Button` 内のアイコンは `data-icon` を使う。 アイコンに `data-icon="inline-start"` または `data-icon="inline-end"` を付ける。
- コンポーネント内のアイコンにサイズクラスを付けない。 コンポーネントは CSS でアイコンサイズを管理する。`size-4` や `w-4 h-4` を付けない。
- アイコンは文字列キーではなくオブジェクトとして渡す。 文字列ルックアップではなく `icon={CheckIcon}`。

### チャットとメッセージング → [chat.md](./rules/chat.md)

- チャット UI はチャット primitive をコンポジションする。会話には `MessageScroller`、行には `Message`、メッセージ面には `Bubble` を使う。バブル用の `div` や生のスクロールコンテナを手作りしない。
- スクロール挙動は `MessageScroller` が管理する。ストリーミング追従、アンカリング、jump-to-latest の `MessageScrollerButton` は組み込み。`useStickToBottom` や `ResizeObserver` のフックを書かない。
- 添付には `Attachment` を使い、システムノートと区切りには `Marker` を使う。`Item` カードや `Separator` + ラベルを使わない。

### CLI

- preset コードを手動でデコードしたり preset URL を組み立てたりしない。 `npx shadcn@latest preset decode <code>`、`preset url <code>`、または `preset open <code>` を使う。プロジェクトを認識する preset 検出には `npx shadcn@latest preset resolve` を使う。
- preset コードは CLI で直接適用する。 既存プロジェクトには `npx shadcn@latest apply <code>`、初期化時は `npx shadcn@latest init --preset <code>` を使う。

## 主要パターン

正しい shadcn/ui コードを書くうえで特に差が出やすい代表的なパターン。エッジケースについては上記のルールファイルを参照する。

```tsx
// フォームレイアウト: div + Label ではなく FieldGroup + Field を使う。
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// バリデーション: Field に data-invalid、コントロールに aria-invalid。
<Field data-invalid>
  <FieldLabel>Email</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>Invalid email.</FieldDescription>
</Field>

// ボタン内のアイコン: data-icon を使い、サイズクラスは付けない。
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

// スペーシング: space-y-* ではなく gap-* を使う。
<div className="flex flex-col gap-4">  // correct
<div className="space-y-4">           // wrong

// 等しい寸法: w-* h-* ではなく size-* を使う。
<Avatar className="size-10">   // correct
<Avatar className="w-10 h-10"> // wrong

// ステータスカラー: 生のカラーではなく Badge variant かセマンティックトークンを使う。
<Badge variant="secondary">+20.1%</Badge>    // correct
<span className="text-emerald-600">+20.1%</span> // wrong
```

## コンポーネント選択

| 必要なもの                  | 使うコンポーネント                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| ボタン/アクション          | 適切な variant を指定した `Button`                                                                  |
| フォーム入力               | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider` |
| 2〜5 個の選択肢の切り替え  | `ToggleGroup` + `ToggleGroupItem`                                                                   |
| データ表示                 | `Table`, `Card`, `Badge`, `Avatar`                                                                  |
| ナビゲーション             | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination`                                     |
| オーバーレイ               | `Dialog` (モーダル), `Sheet` (サイドパネル), `Drawer` (ボトムシート), `AlertDialog` (確認)          |
| フィードバック             | `toast` (Base UI), `sonner` (Radix/Aria), `Alert`, `Progress`, `Skeleton`, `Spinner`                |
| コマンドパレット           | `Dialog` 内に `Command`                                                                             |
| チャート                   | `Chart` (Recharts のラッパー)                                                                       |
| レイアウト                 | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible`                          |
| 空状態                     | `Empty`                                                                                             |
| メニュー                   | `DropdownMenu`, `ContextMenu`, `Menubar`                                                            |
| ツールチップ/情報          | `Tooltip`, `HoverCard`, `Popover`                                                                   |
| チャット/会話 UI           | `MessageScroller`, `Message`, `Bubble`, `Attachment`, `Marker`                                      |

## 主要フィールド

注入されるプロジェクトコンテキストには次の主要フィールドが含まれる。

- `aliases` → 実際の alias プレフィックスを import に使う (例: `@/`、`~/`)。ハードコードしない。
- `isRSC` → `true` のとき、`useState`、`useEffect`、イベントハンドラ、ブラウザ API を使うコンポーネントはファイル先頭に `"use client"` が必要。ディレクティブの案内をする際は必ずこのフィールドを参照する。
- `tailwindVersion` → `"v4"` は `@theme inline` ブロックを使い、`"v3"` は `tailwind.config.js` を使う。
- `tailwindCssFile` → カスタム CSS 変数を定義するグローバル CSS ファイル。常にこのファイルを編集し、新しいファイルを作らない。
- `style` → コンポーネントのビジュアル処理 (例: `nova`、`vega`)。
- `base` → primitive ライブラリ (`radix` または `base`)。コンポーネントの API と利用可能な props に影響する。
- `iconLibrary` → アイコンの import 先を決める。`lucide` なら `lucide-react`、`tabler` なら `@tabler/icons-react` を使う。`lucide-react` を勝手に前提にしない。
- `resolvedPaths` → コンポーネント・utils・hooks などの正確なファイルシステム上の出力先。
- `framework` → ルーティングとファイル規約 (例: Next.js App Router と Vite SPA)。
- `packageManager` → shadcn 以外の依存関係インストールに使う (例: `pnpm add date-fns` と `npm install date-fns` の使い分け)。
- `preset` → 現在のプロジェクトに対して解決された preset コードと値。preset 情報だけが必要なときは `npx shadcn@latest preset resolve --json` を使う。

全フィールドの詳細は [cli.md — `info` コマンド](./cli.md) を参照。

## コンポーネントのドキュメント、サンプル、利用例

`npx shadcn@latest docs <component>` を実行すると、コンポーネントのドキュメント、サンプル、API リファレンスの URL が得られる。これらの URL を fetch して実際の内容を取得する。

```bash
npx shadcn@latest docs button dialog select
```

コンポーネントを作成・修正・デバッグ・利用する際は、必ず最初に `npx shadcn@latest docs` を実行して URL を fetch する。 これにより、推測ではなく正しい API と使い方のパターンに従って作業できる。

## ワークフロー

1. プロジェクトコンテキストを取得する — 上部で既に注入済み。更新が必要なら再度 `npx shadcn@latest info` を実行する。
2. インストール済みコンポーネントをまず確認する — `add` を実行する前に、プロジェクトコンテキストの `components` リストを確認するか `resolvedPaths.ui` ディレクトリを一覧する。未追加のコンポーネントを import したり、既にインストール済みのものを再追加したりしない。
3. コンポーネントを探す — `npx shadcn@latest search`。
4. ドキュメントとサンプルを取得する — `npx shadcn@latest docs <component>` で URL を取得し fetch する。未インストールの registry 項目を閲覧するには `npx shadcn@latest view` を使う。インストール済みコンポーネントへの変更をプレビューするには `npx shadcn@latest add --diff` を使う。
5. インストールまたは更新する — `npx shadcn@latest add`。既存コンポーネントを更新する際は、まず `--dry-run` と `--diff` で変更をプレビューする (下記 [Updating Components](#updating-components) を参照)。
6. サードパーティコンポーネントの import を修正する — コミュニティ registry (例: `@bundui`、`@magicui`) からコンポーネントを追加した後は、追加された非 UI ファイルに `@/components/ui/...` のようなハードコードされた import パスがないか確認する。これらはプロジェクトの実際の alias と一致しない。`npx shadcn@latest info` で正しい `ui` alias (例: `@workspace/ui/components`) を取得し、import を書き換える。CLI は自前の UI ファイルについては import を書き換えるが、サードパーティ registry のコンポーネントはプロジェクトに合わないデフォルトパスを使っていることがある。
7. 追加されたコンポーネントをレビューする — 任意の registry からコンポーネントやブロックを追加したら、必ず追加されたファイルを読み、正しいか確認する。サブコンポーネントの欠落 (例: `SelectGroup` のない `SelectItem`)、import の漏れ、誤ったコンポジション、[重要なルール](#重要なルール) 違反をチェックする。さらに、アイコンの import はプロジェクトコンテキストの `iconLibrary` に合わせて置き換える (例: registry が `lucide-react` を使うがプロジェクトが `hugeicons` を使う場合は、import とアイコン名をそれに合わせて差し替える)。問題はすべて修正してから次に進む。
8. registry は明示する — ユーザーがブロックやコンポーネントの追加を依頼したとき registry を勝手に推測しない。registry が指定されていない場合 (例: ユーザーが `@shadcn`、`@tailark`、`owner/repo` などを指定せず「ログインブロックを追加して」と言った場合) は、どの registry を使うか確認する。ユーザーの代わりに既定の registry を選ばない。
9. preset を切り替えるとき — 先にユーザーに確認する: overwrite、partial、merge、skip のどれか?
   - 現在の preset を確認: `npx shadcn@latest preset resolve`。構造化された値が必要なときは `--json` を付ける。
   - 適用予定の preset を確認: `npx shadcn@latest preset decode <code>`。preset builder を共有・オープンするには `preset url <code>` または `preset open <code>` を使う。
   - Overwrite: `npx shadcn@latest apply <code>`。検出されたコンポーネント、フォント、CSS 変数を上書きする。
   - Partial: `npx shadcn@latest apply <code> --only theme,font`。UI コンポーネントを再インストールせず、選択した preset の一部だけを更新する。指定できる値は `theme` と `font` で、カンマ区切りの組み合わせも可能。`icon` はサポート対象外 — アイコン変更はコンポーネントの再インストールと変換が必要になる場合があるため。
   - Merge: `npx shadcn@latest init --preset <code> --force --no-reinstall` を実行し、続いて `npx shadcn@latest info` でインストール済みコンポーネント一覧を取得し、各コンポーネントを `--dry-run` と `--diff` で [smart merge](#updating-components) する。
   - Skip: `npx shadcn@latest init --preset <code> --force --no-reinstall`。設定と CSS のみを更新し、コンポーネントはそのまま残す。
   - 重要: preset コマンドは必ずユーザーのプロジェクトディレクトリで実行する。`apply` は `components.json` を持つ既存プロジェクトでのみ動作する。CLI は `components.json` の現在の base (`base` か `radix`) を自動的に維持する。スクラッチ/一時ディレクトリを使う必要がある場合 (例: `--dry-run` 比較のため) は、`--base <current-base>` を明示的に渡す — preset コードに base は含まれない。

## コンポーネントの更新

ローカルの変更を保ちつつアップストリームからコンポーネントを更新するように依頼された場合は、`--dry-run` と `--diff` で賢くマージする。GitHub から生ファイルを手動で取得しないこと — 常に CLI を使う。

1. `npx shadcn@latest add <component> --dry-run` を実行し、影響を受けるファイルをすべて確認する。
2. ファイルごとに `npx shadcn@latest add <component> --diff <file>` を実行し、アップストリームとローカルの差分を確認する。
3. diff に基づいてファイル単位で判断する。
   - ローカル変更なし → そのまま上書きしてよい。
   - ローカル変更あり → ローカルファイルを読み、diff を解析し、ローカル変更を保ちながらアップストリームの更新を適用する。
   - ユーザーが「全部更新して」と言った場合 → `--overwrite` を使うが、事前に確認する。
4. ユーザーの明示的な承認なしに `--overwrite` を使わない。

## クイックリファレンス

```bash
# 新規プロジェクトを作成する。
npx shadcn@latest init --name my-app --preset base-nova
npx shadcn@latest init --name my-app --preset a2r6bw --template vite

# monorepo プロジェクトを作成する。
npx shadcn@latest init --name my-app --preset base-nova --monorepo
npx shadcn@latest init --name my-app --preset base-nova --template next --monorepo

# 既存プロジェクトを初期化する。
npx shadcn@latest init --preset base-nova
npx shadcn@latest init --defaults  # shortcut: --template=next --preset=nova (base style implied)

# 既存プロジェクトに preset を適用する。
npx shadcn@latest apply a2r6bw
npx shadcn@latest apply a2r6bw --only theme
npx shadcn@latest apply a2r6bw --only font
npx shadcn@latest apply a2r6bw --only theme,font

# preset コードとプロジェクトの preset 状態を確認する。
npx shadcn@latest preset decode a2r6bw
npx shadcn@latest preset url a2r6bw
npx shadcn@latest preset open a2r6bw
npx shadcn@latest preset resolve
npx shadcn@latest preset resolve --json

# コンポーネントを追加する。
npx shadcn@latest add button card dialog
npx shadcn@latest add @magicui/shimmer-button
npx shadcn@latest add owner/repo/item
npx shadcn@latest add --all

# 追加・更新の前に変更をプレビューする。
npx shadcn@latest add button --dry-run
npx shadcn@latest add button --diff button.tsx
npx shadcn@latest add @acme/form --view button.tsx
npx shadcn@latest add owner/repo/item --dry-run

# registry を検索する。
npx shadcn@latest search @shadcn -q "sidebar"
npx shadcn@latest search @tailark -q "stats"
npx shadcn@latest search owner/repo -q "login"
npx shadcn@latest search                          # 設定済みのすべての registry
npx shadcn@latest search @shadcn -q "menu" -t ui  # アイテムタイプで絞り込み

# コンポーネントのドキュメントとサンプル URL を取得する。
npx shadcn@latest docs button dialog select

# registry 項目の詳細を表示する (未インストール項目向け)。
npx shadcn@latest view @shadcn/button
npx shadcn@latest view owner/repo/item
```

Named presets: `nova`, `vega`, `maia`, `lyra`, `mira`, `luma`
Templates: `next`, `vite`, `start`, `react-router`, `astro` (すべて `--monorepo` をサポート)、`laravel` (monorepo 非対応)
Preset codes: バージョンプレフィックス付きの base62 文字列 (例: `a2r6bw` や `b0`)。[ui.shadcn.com](https://ui.shadcn.com) から取得する。

## 詳細リファレンス

- [rules/forms.md](./rules/forms.md) — FieldGroup、Field、InputGroup、ToggleGroup、FieldSet、バリデーション状態
- [rules/composition.md](./rules/composition.md) — Group、オーバーレイ、Card、Tabs、Avatar、Alert、Empty、Toast、Separator、Skeleton、Badge、Button のローディング
- [rules/chat.md](./rules/chat.md) — MessageScroller、Message、Bubble、Attachment、Marker、ストリーミング、アンカリング、jump-to-latest
- [rules/icons.md](./rules/icons.md) — data-icon、アイコンサイズ、アイコンをオブジェクトとして渡す方法
- [rules/styling.md](./rules/styling.md) — セマンティックカラー、variant、className、スペーシング、size、truncate、ダークモード、cn()、z-index
- [rules/base-vs-radix.md](./rules/base-vs-radix.md) — asChild と render、Select、ToggleGroup、Slider、Accordion
- [cli.md](./cli.md) — コマンド、フラグ、preset、テンプレート
- [registry.md](./registry.md) — source registry の作成、include、アイテム定義、依存関係、GitHub registry のルール
- [customization.md](./customization.md) — テーマ、CSS 変数、コンポーネントの拡張
