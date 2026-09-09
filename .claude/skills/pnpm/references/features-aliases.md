---
name: pnpm-aliases
description: バージョン違い、fork、代替パッケージなどをカスタム名でインストールする
---

# pnpm の Aliases

pnpm は `npm:` プロトコルによるパッケージエイリアスをサポートする。これにより、別名でパッケージをインストールしたり、同一パッケージの複数バージョンを併用したり、パッケージを置換したりできる。

## 基本の文法

```bash
pnpm add <alias>@npm:<package>@<version>
```

`package.json` では、
```json
{
  "dependencies": {
    "<alias>": "npm:<package>@<version>"
  }
}
```

## ユースケース

### 同一パッケージの複数バージョン

異なるバージョンを並行してインストールする。

```json
{
  "dependencies": {
    "lodash3": "npm:lodash@3",
    "lodash4": "npm:lodash@4"
  }
}
```

利用例:
```js
import lodash3 from 'lodash3'
import lodash4 from 'lodash4'
```

### パッケージを fork に置換

パッケージを fork や代替実装に差し替える。

```json
{
  "dependencies": {
    "original-pkg": "npm:my-fork@^1.0.0"
  }
}
```

`original-pkg` への import はすべて `my-fork` に解決される。

### 非推奨パッケージを置換

```json
{
  "dependencies": {
    "request": "npm:@cypress/request@^3.0.0"
  }
}
```

### スコープ付き ⇄ スコープなしの置換

```json
{
  "dependencies": {
    "vue": "npm:@anthropic/vue@^3.0.0",
    "@myorg/utils": "npm:lodash@^4.17.21"
  }
}
```

## CLI の利用

### エイリアス付きで追加

```bash
# lodash をエイリアスで追加
pnpm add lodash4@npm:lodash@4

# fork を元の名前で追加
pnpm add request@npm:@cypress/request
```

### 複数バージョンの追加

```bash
pnpm add react17@npm:react@17 react18@npm:react@18
```

## TypeScript との併用

エイリアスでの型解決のため、TypeScript の設定が必要なことがある。

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "lodash3": ["node_modules/lodash3"],
      "lodash4": ["node_modules/lodash4"]
    }
  }
}
```

`@types` パッケージにもエイリアスを使える。

```json
{
  "devDependencies": {
    "@types/lodash3": "npm:@types/lodash@3",
    "@types/lodash4": "npm:@types/lodash@4"
  }
}
```

## Overrides との組み合わせ

すべての推移的依存にエイリアスを強制する。

```yaml
# pnpm-workspace.yaml
overrides:
  "underscore": "npm:lodash@^4.17.21"
```

これにより、依存内のものも含めすべての `underscore` の import が lodash に置換される。

## Git・ローカルのエイリアス

エイリアスは pnpm の有効な指定子であれば何でも使える。

```json
{
  "dependencies": {
    "my-fork": "npm:user/repo#commit",
    "local-pkg": "file:../local-package"
  }
}
```

## Registry Aliases (namedRegistries)

パッケージエイリアスとは別物として、`namedRegistries` のプレフィックスはパッケージをどの registry から取得するかを選択する。

```yaml title="pnpm-workspace.yaml"
namedRegistries:
  work: https://npm.work.example.com/
```

```bash
pnpm add work:@corp/lib@^2.0.0   # @corp/lib を work registry に対して解決する
```

組み込みの `gh:` エイリアスは GitHub Packages を指す。認証は URL ごとの `.npmrc` エントリを再利用する。

## ベストプラクティス

1. わかりやすい命名: 目的が伝わるエイリアス名を使う
   ```json
   "lodash-legacy": "npm:lodash@3"
   "lodash-modern": "npm:lodash@4"
   ```

2. エイリアスを文書化する: なぜエイリアスを使うのかを説明する

3. 全体的な置換には overrides を優先する: あらゆる場所で置換したいなら、エイリアスではなく `pnpm-workspace.yaml` の `overrides` を使う

4. 十分にテストする: エイリアスされたパッケージは挙動が微妙に異なる可能性がある

<!--
Source references:
- https://pnpm.io/aliases
- https://pnpm.io/settings#namedregistries
-->
