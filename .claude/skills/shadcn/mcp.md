# shadcn MCP Server

CLI には MCP サーバーが同梱されており、AI アシスタントが registry からアイテムを検索・閲覧・表示・インストールできるようになる。

---

## セットアップ

```bash
shadcn mcp        # MCP サーバーを起動する (stdio)
shadcn mcp init   # 利用しているエディタ用の設定を書き出す
```

エディタごとの設定ファイル:

| エディタ | 設定ファイル |
|--------|------------|
| Claude Code | `.mcp.json` |
| Cursor | `.cursor/mcp.json` |
| VS Code | `.vscode/mcp.json` |
| OpenCode | `opencode.json` |
| Codex | `~/.codex/config.toml` (手動) |

---

## ツール

> ヒント: MCP ツールは registry 操作 (検索・閲覧・インストール) を扱う。プロジェクト設定 (alias、framework、Tailwind バージョン) は `npx shadcn@latest info` を使う — これに相当する MCP ツールはない。

### `shadcn:get_project_registries`

`components.json` から registry 名を返す。`components.json` が存在しない場合はエラーになる。

入力: なし

### `shadcn:list_items_in_registries`

1 つ以上の registry のすべてのアイテムを一覧する。registry には `@acme` のような設定済み namespace、`owner/repo` のような公開 GitHub ソース、registry カタログ URL を指定できる。`registries` を省略すると `components.json` に設定されたすべての registry から一覧する。

入力: `registries` (string[]、省略可 — 省略時は設定済みすべて)、`types` (string[]、省略可 — 例: `["ui", "block"]`)、`limit` (number、省略可、デフォルト 100)、`offset` (number、省略可)

### `shadcn:search_items_in_registries`

registry 横断のファジー検索を行う。registry には設定済み namespace、公開 GitHub ソース、registry カタログ URL を指定できる。`registries` を省略すると `components.json` に設定されたすべての registry を検索する — 例: 設定済みの全 registry から「hero を探して」。

入力: `registries` (string[]、省略可 — 省略時は設定済みすべて)、`query` (string)、`types` (string[]、省略可 — 例: `["ui", "block"]`)、`limit` (number、省略可、デフォルト 100)、`offset` (number、省略可)

### `shadcn:view_items_in_registries`

アイテムの詳細をファイル内容も含めて表示する。

入力: `items` (string[]) — 例: `["@shadcn/button", "@shadcn/card", "owner/repo/item"]`

### `shadcn:get_item_examples_from_registries`

利用例やデモをソースコード付きで探す。`registries` を省略すると `components.json` に設定されたすべての registry を検索する。

入力: `registries` (string[]、省略可 — 省略時は設定済みすべて)、`query` (string) — 例: `"accordion-demo"`、`"button example"`

### `shadcn:get_add_command_for_items`

CLI のインストールコマンドを返す。

入力: `items` (string[]) — 例: `["@shadcn/button"]`

### `shadcn:get_audit_checklist`

コンポーネント検証用のチェックリスト (imports、deps、lint、TypeScript) を返す。

入力: なし

---

## registry の設定

namespace 付き registry と認証付き registry は `components.json` で設定する。`@shadcn` registry は常に組み込みで使える。公開 GitHub registry は、リポジトリのルートに `registry.json` があれば `owner/repo` の registry ソースとして直接使える。この場合 `components.json` の設定は不要。

```json
{
  "registries": {
    "@acme": "https://acme.com/r/{name}.json",
    "@private": {
      "url": "https://private.com/r/{name}.json",
      "headers": { "Authorization": "Bearer ${MY_TOKEN}" }
    }
  }
}
```

- 名前は `@` で始める必要がある。
- URL には `{name}` を含める必要がある。
- `${VAR}` 形式は環境変数から解決される。

コミュニティ registry のインデックス: `https://ui.shadcn.com/r/registries.json`
