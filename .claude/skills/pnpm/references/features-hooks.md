---
name: pnpm-hooks
description: .pnpmfile.mjs の hook・finder・カスタム resolver / fetcher で解決・設定・packing・取得をカスタマイズする
---

# pnpm の Hooks (.pnpmfile.mjs)

pnpm の hook はインストール処理をカスタマイズする。ESM の `.pnpmfile.mjs` を推奨し、CommonJS の `.pnpmfile.cjs` も使える。lockfile の隣、monorepo では workspace ルートに置く。

> 現行の形式は ESM の `export const hooks = { ... }` である。従来の CommonJS の `module.exports = { hooks }` も `.pnpmfile.cjs` で引き続き動作する。

## セットアップ

```js title=".pnpmfile.mjs"
export const hooks = {
  readPackage,
  afterAllResolved,
  updateConfig,
  beforePacking,
}
```

## hook リファレンス

| Hook | タイミング | 用途 |
|------|-----|-----|
| `readPackage(pkg, ctx)` | 依存の manifest がパースされた後 | 依存の `package.json` を変更する。解決に影響する |
| `afterAllResolved(lockfile, ctx)` | 解決後 | 書き込まれる前の lockfile を変更する |
| `updateConfig(config)` | インストール前 | pnpm の設定を変更する。config dependency と組み合わせると強力 |
| `beforePacking(pkg)` | `pnpm pack` / `publish` の tarball 作成前 | 公開される manifest のみをカスタマイズする |
| `preResolution(opts)` | lockfile 読み込み後、解決前 | lockfile オブジェクトを検査・変更する |
| `importPackage(dir, opts)` | node_modules への書き込み時 | パッケージのリンク方法を変更する |

## readPackage

解決前にすべてのパッケージに対して呼び出される。よくある使い方:

```js title=".pnpmfile.mjs"
function readPackage(pkg, context) {
  // 不足する peer dependency を追加
  if (pkg.name === 'some-broken-package') {
    pkg.peerDependencies = { ...pkg.peerDependencies, react: '*' }
  }
  // 推移的依存のバージョンを固定
  if (pkg.dependencies?.lodash) pkg.dependencies.lodash = '^4.17.21'
  // 問題を起こす optional dependency を削除
  delete pkg.optionalDependencies?.fsevents
  // 非推奨の依存を置き換え
  if (pkg.dependencies?.['old-pkg']) {
    pkg.dependencies['new-pkg'] = pkg.dependencies['old-pkg']
    delete pkg.dependencies['old-pkg']
  }
  return pkg
}

export const hooks = { readPackage }
```

> 変更はディスクに書き込まれず、解決にのみ影響する。ロック済みの依存を再解決するには `pnpm-lock.yaml` を削除する。ここで `scripts` を削除してもビルドは止まらない。代わりに `allowBuilds` 設定を使う。依存のファイルへの変更を永続化するには `pnpm patch` を使う。

## updateConfig

pnpm 自体の設定をプログラムから変更する。config dependency に含めて配布すると設定をリポジトリ間で共有でき、最も強力である。

```js title=".pnpmfile.mjs"
export const hooks = {
  updateConfig(config) {
    return Object.assign(config, {
      enablePrePostScripts: false,
      optimisticRepeatInstall: true,
      resolutionMode: 'lowest-direct',
      verifyDepsBeforeRun: 'install',
    })
  }
}
```

```js
// プラグインから catalog エントリを追加
export const hooks = {
  updateConfig(config) {
    config.catalogs.default ??= {}
    config.catalogs.default['is-odd'] = '1.0.0'
    return config
  }
}
```

## beforePacking

ローカルの `package.json` に触れずに、公開 tarball に入る manifest をカスタマイズする。

```js title=".pnpmfile.mjs"
export const hooks = {
  beforePacking(pkg) {
    delete pkg.devDependencies
    pkg.main = './dist/index.js'
    return pkg
  }
}
```

## afterAllResolved

```js title=".pnpmfile.mjs"
export const hooks = {
  afterAllResolved(lockfile, context) {
    context.log(`Resolved ${Object.keys(lockfile.packages || {}).length} packages`)
    return lockfile
  }
}
```

## Finders (pnpm list / why)

`--find-by` で使うカスタム述語を定義する。

```js title=".pnpmfile.mjs"
export const finders = {
  react17: (ctx) => ctx.readManifest().peerDependencies?.react === '^17.0.0'
}
```

```bash
pnpm why --find-by=react17
```

## カスタム resolver と fetcher

上級者向けの機能である。トップレベルで `resolvers` / `fetchers` を登録すると、`my-protocol:pkg` のような新しいパッケージスキームをサポートできる。各エントリは軽量な `canResolve` / `canFetch` ガードと `resolve` / `fetch` を持つオブジェクトである。カスタム resolver は組み込みより先に実行される。カスタム解決の `type` フィールドには `custom:` プレフィックスが必要である。

```js title=".pnpmfile.cjs"
const resolver = {
  canResolve: (dep) => dep.alias.startsWith('@company/'),
  resolve: async (dep) => ({
    id: `${dep.alias}@${dep.bareSpecifier}`,
    resolution: { type: 'custom:cdn', cdnUrl: '...' },
  }),
}
const fetcher = {
  canFetch: (id, res) => res.type === 'custom:cdn',
  fetch: (cafs, res, opts, fetchers) =>
    fetchers.remoteTarball(cafs, { tarball: res.cdnUrl, integrity: res.integrity }, opts),
}
module.exports = { resolvers: [resolver], fetchers: [fetcher] }
```

> `hooks.fetchers` は v11 で削除された。代わりにトップレベルの `fetchers` export を使う。

## 関連設定

```yaml title="pnpm-workspace.yaml"
ignorePnpmfile: false                  # pnpmfile を完全に無視する
pnpmfile: ['.pnpmfile.mjs']            # ローカルの pnpmfile の場所
globalPnpmfile: ~/.pnpm/global_pnpmfile.mjs
```

## Hooks と Overrides の比較

| | Hooks (.pnpmfile) | Overrides (pnpm-workspace.yaml) |
|--|-------------------|---------------------------------|
| ロジック | JavaScript | 宣言的 |
| スコープ | manifest の任意フィールド、config、lockfile、packing | バージョン |
| 用途 | 条件付き・複雑な修正 | 単純なバージョン固定 |

単純なケースには `overrides` / `packageExtensions` を優先する。条件分岐、設定共有、packing の調整には hook を使う。

## 要点

- `export const hooks` / `finders` / `resolvers` / `fetchers` を使う `.pnpmfile.mjs` を推奨する
- 新しい hook として、設定を変更する `updateConfig`、公開 manifest を変更する `beforePacking`、`preResolution`、`importPackage` がある
- `updateConfig` を config dependency と組み合わせ、設定や catalog をリポジトリ間で共有する
- `--ignore-scripts` では pnpmfile は無効にならない。`ignorePnpmfile` を使う

<!--
Source references:
- https://pnpm.io/pnpmfile
- https://pnpm.io/finders
- https://pnpm.io/config-dependencies
-->
