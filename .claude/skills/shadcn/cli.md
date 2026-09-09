# shadcn CLI リファレンス

設定は `components.json` から読み込まれる。

> 重要: コマンドは必ずプロジェクトの package runner で実行する: `npx shadcn@latest`、`pnpm dlx shadcn@latest`、`bunx --bun shadcn@latest`。どれを使うかは、プロジェクトコンテキストの `packageManager` を確認して選ぶ。以下の例では `npx shadcn@latest` を使っているが、プロジェクトに合った runner に置き換えること。

> 重要: 使うフラグは下記に記載のあるものだけにする。フラグを推測したり捏造したりしない — ここに載っていないフラグは存在しない。CLI はプロジェクトの lockfile から package manager を自動検出する。`--package-manager` フラグは存在しない。

## 目次

- コマンド: init、apply、add (dry-run、smart merge)、search、view、docs、info、build
- テンプレート: next、vite、start、react-router、astro
- preset: named、code、URL のフォーマットとフィールド
- preset の切り替え

---

## コマンド

### `init` — プロジェクトの初期化または新規作成

```bash
npx shadcn@latest init [components...] [options]
```

既存プロジェクトに shadcn/ui を初期化するか、`--name` が指定されたときは新規プロジェクトを作成する。任意で同じステップでコンポーネントもインストールできる。

| フラグ                  | 短縮 | 説明                                                          | デフォルト |
| ----------------------- | ---- | ------------------------------------------------------------- | ---------- |
| `--template <template>` | `-t` | テンプレート (next、start、vite、next-monorepo、react-router) | —          |
| `--preset [name]`       | `-p` | preset 設定 (名前、コード、URL)                               | —          |
| `--yes`                 | `-y` | 確認プロンプトをスキップ                                      | `true`     |
| `--defaults`            | `-d` | デフォルトを使う (`--template=next --preset=base-nova`)       | `false`    |
| `--force`               | `-f` | 既存の設定を強制的に上書き                                    | `false`    |
| `--cwd <cwd>`           | `-c` | 作業ディレクトリ                                              | カレント   |
| `--name <name>`         | `-n` | 新規プロジェクト名                                            | —          |
| `--silent`              | `-s` | 出力を抑制                                                    | `false`    |
| `--rtl`                 |      | RTL サポートを有効化                                          | —          |
| `--reinstall`           |      | 既存 UI コンポーネントを再インストール                        | `false`    |
| `--monorepo`            |      | monorepo プロジェクトを scaffold                              | —          |
| `--no-monorepo`         |      | monorepo プロンプトをスキップ                                 | —          |

`npx shadcn@latest create` は `npx shadcn@latest init` のエイリアス。

### `apply` — 既存プロジェクトに preset を適用

```bash
npx shadcn@latest apply [preset] [options]
```

既存プロジェクトに preset を適用し、preset 由来の設定、フォント、CSS 変数、検出された UI コンポーネントを上書きする。

| フラグ              | 短縮 | 説明                            | デフォルト |
| ------------------- | ---- | ------------------------------- | ---------- |
| `--preset <preset>` | —    | preset 設定 (名前、コード、URL) | —          |
| `--yes`             | `-y` | 確認プロンプトをスキップ        | `false`    |
| `--cwd <cwd>`       | `-c` | 作業ディレクトリ                | カレント   |
| `--silent`          | `-s` | 出力を抑制                      | `false`    |

`[preset]` は `--preset <preset>` の省略形。両方指定する場合は一致している必要がある。
preset を指定しない場合、CLI は `ui.shadcn.com/create` のカスタム preset builder を開くか確認する。

### `add` — コンポーネントの追加

> 重要: ローカルのコンポーネントをアップストリームと比較したり変更をプレビューしたりするときは、必ず `npx shadcn@latest add <component> --dry-run`、`--diff`、`--view` を使う。GitHub などから生ファイルを手動で取得してはいけない。CLI が registry 解決、ファイルパス、CSS diff を自動で処理する。

```bash
npx shadcn@latest add [components...] [options]
```

コンポーネント名、registry プレフィックス付きの名前 (`@magicui/shimmer-button`)、GitHub アイテムアドレス (`owner/repo/item`)、URL、ローカルパスを受け付ける。

| フラグ          | 短縮 | 説明                                                                                                                  | デフォルト |
| --------------- | ---- | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| `--yes`         | `-y` | 確認プロンプトをスキップ                                                                                              | `false`    |
| `--overwrite`   | `-o` | 既存ファイルを上書き                                                                                                  | `false`    |
| `--cwd <cwd>`   | `-c` | 作業ディレクトリ                                                                                                      | カレント   |
| `--all`         | `-a` | 利用可能なコンポーネントをすべて追加                                                                                  | `false`    |
| `--path <path>` | `-p` | コンポーネントの出力パス                                                                                              | —          |
| `--silent`      | `-s` | 出力を抑制                                                                                                            | `false`    |
| `--dry-run`     |      | ファイルを書き込まずにすべての変更をプレビュー                                                                        | `false`    |
| `--diff [path]` |      | diff を表示。パスなしなら先頭 5 ファイル、パス指定でそのファイルのみ (`--dry-run` を含む)                             | —          |
| `--view [path]` |      | ファイル内容を表示。パスなしなら先頭 5 ファイル、パス指定でそのファイルのみ (`--dry-run` を含む)                      | —          |

#### Dry-Run モード

`--dry-run` を使うと、`add` が何をするかをファイルを書き込まずにプレビューできる。`--diff` と `--view` はどちらも `--dry-run` を含意する。

```bash
# すべての変更をプレビュー。
npx shadcn@latest add button --dry-run

# 全ファイルの diff を表示 (先頭 5 件)。
npx shadcn@latest add button --diff

# 特定ファイルの diff を表示。
npx shadcn@latest add button --diff button.tsx

# 全ファイルの内容を表示 (先頭 5 件)。
npx shadcn@latest add button --view

# 特定ファイルのフル内容を表示。
npx shadcn@latest add button --view button.tsx

# URL でも動作する。
npx shadcn@latest add https://api.npoint.io/abc123 --dry-run

# 公開 GitHub registry でも動作する。
npx shadcn@latest add owner/repo/item --dry-run

# CSS の diff。
npx shadcn@latest add button --diff globals.css
```

dry-run を使うタイミング:

- ユーザーから「どんなファイルが追加される?」「何が変わる?」と聞かれた場合 — `--dry-run` を使う。
- 既存コンポーネントを上書きする前 — 先に `--diff` で変更を確認する。
- インストールせずにコンポーネントのソースコードを確認したい場合 — `--view` を使う。
- `globals.css` への CSS 変更を確認したい場合 — `--diff globals.css` を使う。
- サードパーティ registry のコードをインストール前にレビュー・監査したい場合 — `--view` でソースを確認する。

> `npx shadcn@latest add --dry-run` と `npx shadcn@latest view` の使い分け: ユーザーがプロジェクトへの変更をプレビューしたい場合は `npx shadcn@latest view` よりも `npx shadcn@latest add --dry-run/--diff/--view` を優先する。`npx shadcn@latest view` は registry のメタデータをそのまま表示するだけ。`npx shadcn@latest add --dry-run` は実際にユーザーのプロジェクトで何が起きるか — 解決後のファイルパス、既存ファイルとの diff、CSS の更新内容 — を正確に示す。`npx shadcn@latest view` は、プロジェクトコンテキストなしで registry の情報だけを見たいときに使う。

#### アップストリームからの Smart Merge

完全なワークフローは [SKILL.md のコンポーネント更新](./SKILL.md#コンポーネントの更新) を参照。

### `search` — registry の検索

```bash
npx shadcn@latest search [registries...] [options]
```

registry 横断のファジー検索。`npx shadcn@latest list` でも呼べる。namespace (`@acme`)、公開 GitHub registry ソース (`owner/repo`)、registry カタログ URL をサポートする。`-q` を付けない場合は全アイテムを一覧する。registry を指定しない場合は `components.json` に設定されたすべての registry を検索する。

| フラグ              | 短縮 | 説明                                                              | デフォルト |
| ------------------- | ---- | ----------------------------------------------------------------- | ---------- |
| `--query <query>`   | `-q` | 検索クエリ                                                        | —          |
| `--type <type>`     | `-t` | アイテムタイプで絞り込み (例: `ui`、`block`、`hook`)。カンマ区切り可 | —          |
| `--limit <number>`  | `-l` | 表示する最大アイテム数                                            | `100`      |
| `--offset <number>` | `-o` | スキップするアイテム数                                            | `0`        |
| `--json`            |      | JSON で出力                                                       | `false`    |
| `--cwd <cwd>`       | `-c` | 作業ディレクトリ                                                  | カレント   |

### `view` — アイテム詳細の表示

```bash
npx shadcn@latest view <items...> [options]
```

アイテム情報をファイル内容付きで表示する。例: `npx shadcn@latest view @shadcn/button`、`npx shadcn@latest view owner/repo/item`。

### `docs` — コンポーネントドキュメント URL の取得

```bash
npx shadcn@latest docs <components...> [options]
```

コンポーネントのドキュメント、サンプル、API リファレンスの解決済み URL を出力する。コンポーネント名を 1 つ以上受け付ける。実際の内容は URL を fetch して取得する。

`npx shadcn@latest docs input button` の出力例:

```
base  radix

input
  docs      https://ui.shadcn.com/docs/components/radix/input
  examples  https://raw.githubusercontent.com/.../examples/input-example.tsx

button
  docs      https://ui.shadcn.com/docs/components/radix/button
  examples  https://raw.githubusercontent.com/.../examples/button-example.tsx
```

一部のコンポーネントには、基盤ライブラリへの `api` リンクが含まれる (例: command コンポーネントの `cmdk`)。

### `diff` — 更新確認

このコマンドは使わない。代わりに `npx shadcn@latest add --diff` を使う。

### `info` — プロジェクト情報

```bash
npx shadcn@latest info [options]
```

プロジェクト情報と `components.json` の設定を表示する。プロジェクトの framework、alias、Tailwind バージョン、解決済みパスを把握するために最初に実行する。

| フラグ        | 短縮 | 説明             | デフォルト |
| ------------- | ---- | ---------------- | ---------- |
| `--cwd <cwd>` | `-c` | 作業ディレクトリ | カレント   |

Project Info フィールド:

| フィールド           | 型        | 意味                                                                |
| -------------------- | --------- | ------------------------------------------------------------------- |
| `framework`          | `string`  | 検出された framework (`next`、`vite`、`react-router`、`start` など) |
| `frameworkVersion`   | `string`  | framework バージョン (例: `15.2.4`)                                 |
| `isSrcDir`           | `boolean` | プロジェクトが `src/` ディレクトリを使うかどうか                    |
| `isRSC`              | `boolean` | React Server Components が有効かどうか                              |
| `isTsx`              | `boolean` | プロジェクトが TypeScript を使うかどうか                            |
| `tailwindVersion`    | `string`  | `"v3"` または `"v4"`                                                |
| `tailwindConfigFile` | `string`  | Tailwind 設定ファイルのパス                                         |
| `tailwindCssFile`    | `string`  | グローバル CSS ファイルのパス                                       |
| `aliasPrefix`        | `string`  | import alias プレフィックス (例: `@`、`~`、`@/`)                    |
| `packageManager`     | `string`  | 検出された package manager (`npm`、`pnpm`、`yarn`、`bun`)           |

Components.json フィールド:

| フィールド           | 型        | 意味                                                                                            |
| -------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `base`               | `string`  | primitive ライブラリ (`radix` または `base`) — コンポーネント API と使える props に影響        |
| `style`              | `string`  | ビジュアルスタイル (例: `nova`、`vega`)                                                         |
| `rsc`                | `boolean` | 設定の RSC フラグ                                                                               |
| `tsx`                | `boolean` | TypeScript フラグ                                                                               |
| `tailwind.config`    | `string`  | Tailwind 設定パス                                                                               |
| `tailwind.css`       | `string`  | グローバル CSS パス — カスタム CSS 変数はここに記述する                                         |
| `iconLibrary`        | `string`  | アイコンライブラリ — アイコンの import パッケージを決める (例: `lucide-react`、`@tabler/icons-react`) |
| `aliases.components` | `string`  | コンポーネントの import alias (例: `@/components`)                                              |
| `aliases.utils`      | `string`  | utils の import alias (例: `@/lib/utils`)                                                       |
| `aliases.ui`         | `string`  | UI コンポーネントの alias (例: `@/components/ui`)                                               |
| `aliases.lib`        | `string`  | lib の alias (例: `@/lib`)                                                                      |
| `aliases.hooks`      | `string`  | hooks の alias (例: `@/hooks`)                                                                  |
| `resolvedPaths`      | `object`  | 各 alias の絶対ファイルシステムパス                                                             |
| `registries`         | `object`  | 設定済みのカスタム registry                                                                     |

Links フィールド:

`info` の出力には Links セクションがあり、コンポーネントのドキュメント、ソース、サンプル用のテンプレート URL が含まれる。解決済み URL が必要な場合は `npx shadcn@latest docs <component>` を使う。

### `build` — カスタム registry のビルド

```bash
npx shadcn@latest build [registry] [options]
```

配布用に `registry.json` を個別の JSON ファイルへビルドする。デフォルト入力: `./registry.json`、デフォルト出力: `./public/r`。

作成ルール、`include`、アイテム定義、`registryDependencies`、GitHub registry の挙動については [registry.md](./registry.md) を参照。

| フラグ            | 短縮 | 説明             | デフォルト   |
| ----------------- | ---- | ---------------- | ------------ |
| `--output <path>` | `-o` | 出力ディレクトリ | `./public/r` |
| `--cwd <cwd>`     | `-c` | 作業ディレクトリ | カレント     |

---

## テンプレート

| 値             | Framework      | monorepo サポート |
| -------------- | -------------- | ----------------- |
| `next`         | Next.js        | あり              |
| `vite`         | Vite           | あり              |
| `start`        | TanStack Start | あり              |
| `react-router` | React Router   | あり              |
| `astro`        | Astro          | あり              |
| `laravel`      | Laravel        | なし              |

すべてのテンプレートは `--monorepo` フラグで monorepo scaffold をサポートする。`--monorepo` を指定すると CLI は monorepo 用のテンプレートディレクトリ (例: `next-monorepo`、`vite-monorepo`) を使う。`--monorepo` も `--no-monorepo` も指定されない場合は対話的に確認する。Laravel は monorepo の scaffold をサポートしない。

---

## Preset

`--preset` で preset を指定する方法は 3 種類:

1. Named: `--preset nova` や `--preset lyra`
2. Code: `--preset a2r6bw` (バージョンプレフィックス付きの base62 文字列。例: `a2r6bw`、`b0`)
3. URL: `--preset "https://ui.shadcn.com/init?base=radix&style=nova&..."`

> 重要: preset コードを手動でデコード・取得・解決しようとしない。preset コードは不透明な値 — そのまま `npx shadcn@latest init --preset <code>` に渡し、解決は CLI に任せる。
> 既存プロジェクトの preset を上書きするときは `npx shadcn@latest apply --preset <code>` を使う。

## preset の切り替え

先にユーザーに確認する: 既存コンポーネントを overwrite、merge、skip のどれにするか?

- Overwrite / Re-install → `npx shadcn@latest apply --preset <code>`。検出されたコンポーネントファイルをすべて新しい preset のスタイルで上書きする。ユーザーがコンポーネントをカスタマイズしていないときに使う。
- Merge → `npx shadcn@latest init --preset <code> --force --no-reinstall` を実行し、続いて `npx shadcn@latest info` でインストール済みコンポーネント一覧を取得し、[smart merge ワークフロー](./SKILL.md#コンポーネントの更新) を使って 1 つずつローカル変更を保ちながら更新する。ユーザーがコンポーネントをカスタマイズしているときに使う。
- Skip → `npx shadcn@latest init --preset <code> --force --no-reinstall`。設定と CSS 変数のみを更新し、既存コンポーネントはそのまま残す。

preset コマンドは必ずユーザーのプロジェクトディレクトリで実行する。`apply` は `components.json` を持つ既存プロジェクトでのみ動作する。CLI は `components.json` の現在の base (`base` か `radix`) を自動的に維持する。スクラッチ/一時ディレクトリを使う必要がある場合 (例: `--dry-run` 比較のため) は `--base <current-base>` を明示的に渡す — preset コードに base は含まれない。
