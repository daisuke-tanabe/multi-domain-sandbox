# Registry の作成とアドレス

ユーザーが shadcn registry を作成・修正・公開・検討したいときにこのリファレンスを使う。

## メンタルモデル

registry には 2 つの形態がある。

- Source registry: プロジェクトまたはリポジトリ内に書かれた `registry.json`。`include` と、ソースファイルを指すファイルパスを使える。
- Built registry: CLI の利用者に配信される生成済み JSON ファイル。通常は `public/r` から配信される。この形態を作るには `npx shadcn@latest build` を使う。

CLI のインストーラは registry アイテムのペイロードを消費する。source registry は、実際のファイルからそのペイロードを作成するための手段。

registry アイテムは React コンポーネントに限らない。コンポーネント、フック、ユーティリティ、デザイントークン、ページ、設定ファイル、ドキュメント、ルール、ワークフロー、テンプレート、MCP ファイルなどのプロジェクトファイルを配布できる。

## ルートの `registry.json`

ルートの registry ファイルには registry のメタデータと、`items` または `include` のいずれかを定義する。

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "acme",
  "homepage": "https://acme.com",
  "items": [
    {
      "name": "absolute-url",
      "type": "registry:lib",
      "title": "Absolute URL",
      "description": "A utility to turn any path into an absolute URL.",
      "files": [
        {
          "path": "lib/absolute-url.ts",
          "type": "registry:lib"
        }
      ]
    }
  ]
}
```

ルート registry のルール:

- ルートの `registry.json` には `name` と `homepage` が必須。
- `items` は registry アイテム定義の配列。
- `include` を使って source registry を複数ファイルに分割できる。
- include されるファイルでは `name` と `homepage` を省略できる。

## Include

大きな registry をモジュール化して保つには `include` を使う。

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "acme",
  "homepage": "https://acme.com",
  "include": ["registry/ui/registry.json", "registry/blocks/registry.json"]
}
```

include のルール:

- include のパスは、それを宣言した `registry.json` からの相対パス。
- include のパスは `registry.json` ファイルを明示的に指す必要がある。
- リモート URL、絶対パス、親ディレクトリへの遡り (`..`) は使わない。
- アイテムのファイルパスは、そのアイテムを宣言した registry ファイルからの相対パス。
- 解決後の registry 全体でアイテム名が重複するとエラーになる。

include されるファイルの例:

```json
{
  "items": [
    {
      "name": "button",
      "type": "registry:ui",
      "files": [
        {
          "path": "button.tsx",
          "type": "registry:ui"
        }
      ]
    }
  ]
}
```

このファイルが `registry/ui/registry.json` にある場合、`button.tsx` は `registry/ui/button.tsx` から読み込まれ、ビルド後のアイテムパスはルート registry からの相対で出力される。

## アイテム定義

よく使うアイテムフィールド:

```json
{
  "name": "login-form",
  "type": "registry:block",
  "title": "Login Form",
  "description": "A login form with email and password fields.",
  "dependencies": ["zod"],
  "registryDependencies": ["button", "input", "label"],
  "files": [
    {
      "path": "blocks/login-form.tsx",
      "type": "registry:block"
    }
  ],
  "cssVars": {
    "light": {
      "brand": "oklch(0.62 0.18 250)"
    },
    "dark": {
      "brand": "oklch(0.72 0.16 250)"
    }
  }
}
```

重要なフィールド:

- `name`: インストール可能なアイテム名。ファイルパスとは限らない。
- `type`: registry アイテムタイプのいずれか。`registry:ui`、`registry:block`、`registry:lib`、`registry:hook`、`registry:file`、`registry:page`、`registry:theme`、`registry:style`、`registry:font`、`registry:item` など。
- `files`: アイテムがコピーまたは生成するソースファイル。
- `dependencies`: npm のランタイム依存。
- `devDependencies`: npm の開発依存。
- `registryDependencies`: このアイテムが必要とする他の registry アイテム。
- `cssVars`、`css`、`tailwind`、`envVars`、`docs`: インストール時に追加される任意の設定。

ファイルのルール:

- ファイルパスは、宣言元の `registry.json` からの相対パス。
- `registry:file` と `registry:page` のファイルには `target` が必須。
- source registry のファイルパスにリモートファイル URL を使わない。
- ソースファイルはコピー & ペースト可能な状態に保つ。アプリ専用の隠れた import を含めない。

## Registry の依存関係

`registryDependencies` のエントリはアイテムアドレスであり、ファイルパスではない。

```json
{
  "name": "login-form",
  "type": "registry:block",
  "registryDependencies": ["button", "@acme/input", "acme/ui/card#v1.2.0"],
  "files": [
    {
      "path": "blocks/login-form.tsx",
      "type": "registry:block"
    }
  ]
}
```

依存関係のルール:

- `"button"` のような裸の名前は公式 shadcn アイテムを意味する。
- 裸の名前が同一 registry や同一リポジトリのアイテムを指すことはない。
- namespace 付きの依存は `@namespace/item-name` を使う。
- GitHub の依存は `owner/repo/item-name` を使う。
- 必要に応じて `owner/repo/item-name#ref` で GitHub 依存を固定する。
- ref は継承されない。`owner/repo/foo#v2` が同じリポジトリの `v2` にある `bar` に依存するなら、`owner/repo/bar#v2` と書く。
- `"./bar"` のような相対依存は使わない。

## アドレススキーム

registry アイテムの文字列について考えるときは、まず分類する。

| アドレス                            | スキーム  | 意味                                                          |
| ----------------------------------- | --------- | ------------------------------------------------------------- |
| `button`                            | shadcn    | `button` という名前の公式 shadcn アイテム。                   |
| `@acme/button`                      | namespace | 設定済み registry `@acme` のアイテム `button`。               |
| `@acme/ui/button`                   | namespace | 設定済み registry `@acme` のアイテム `ui/button`。            |
| `https://example.com/r/button.json` | url       | その URL にあるビルド済み registry アイテム JSON。            |
| `./button.json`                     | file      | ディスク上のビルド済み registry アイテム JSON。               |
| `acme/ui/button`                    | github    | GitHub リポジトリ `acme/ui` のアイテム `button`。             |
| `acme/ui/forms/login#main`          | github    | GitHub リポジトリ `acme/ui` の ref `main` にあるアイテム `forms/login`。 |

namespace と GitHub のアドレスではスラッシュを含むアイテム名が許され、それはアイテム名でありファイルパスではない。`.json` で終わるアドレスは file アドレスの優先度を保つため、`acme/ui/data/schema.json` は GitHub アイテムアドレスではなくファイルパスとして扱われる。

## GitHub Registry

公開 GitHub リポジトリは、ルートに `registry.json` があれば source registry として機能する。

```txt
owner/repo/item-name[#ref]
```

ルール:

- 最初の 2 つのパスセグメントは GitHub の owner と repo。
- 残りのパスセグメントはすべて registry アイテム名。
- source のエントリポイントは常にルートの `registry.json`。
- GitHub registry は CLI が直接消費する source registry。`shadcn build` や生成済みアイテム JSON ファイルは不要。
- `include` はローカル registry と同じ source registry のルールに従う。
- 現時点で GitHub アドレスは公開の `github.com` リポジトリのみをサポートする。
- プライベートリポジトリと GitHub Enterprise には明示的なプロダクト判断が必要。

GitHub registry のフェッチを実装するときは、ソースファイルを読む前に ref をコミット SHA に解決する。`raw.githubusercontent.com` から動く ref を直接読まない。ブランチ系の ref は数分間キャッシュされることがあるため。

推奨フロー:

```txt
owner/repo[#ref]
  -> git ls-remote で ref を解決
  -> コミット SHA
  -> https://raw.githubusercontent.com/{owner}/{repo}/{sha}/registry.json を読む
  -> include とアイテムファイルを同じ SHA から読む
```

これにより 1 つのコマンドが一貫したリポジトリスナップショット上で動く。

40 文字のフルコミット SHA は既に安定しているのでそのまま使える。ブランチ、タグ、短縮 ref は Git を必要とし、CLI が先にコミット SHA へ解決する。

## ビルドと検証

source registry のビルドには CLI を使う。

```bash
npx shadcn@latest build
npx shadcn@latest build registry.json --output public/r
```

結果の確認には CLI コマンドを使う。

```bash
npx shadcn@latest list @acme
npx shadcn@latest search @acme -q "login"
npx shadcn@latest view @acme/login-form
npx shadcn@latest add @acme/login-form --dry-run
npx shadcn@latest registry validate ./registry.json
```

公開 GitHub registry には GitHub アドレスを直接使う。

```bash
npx shadcn@latest list owner/repo
npx shadcn@latest search owner/repo -q "login"
npx shadcn@latest view owner/repo/item
npx shadcn@latest add owner/repo/item --dry-run
npx shadcn@latest registry validate owner/repo
```

shadcn/ui コードベースで registry の実装に取り組むときのルール:

- アドレスのパースは純粋でテスト可能に保つ。
- バリデータに副作用を追加しない。
- 公式 shadcn、namespace、URL、file の各スキームの既存挙動を維持する。
- アドレスのパース、ソースの読み込み、依存解決、list、search、view、add の各パスにテストを追加する。
- 実際のプロバイダが複数になるまでは、プラグインシステムより小さな source reader の抽象を優先する。
