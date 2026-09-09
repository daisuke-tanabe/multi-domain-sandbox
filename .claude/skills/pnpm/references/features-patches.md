---
name: pnpm-patches
description: サードパーティパッケージに独自パッチを当てて修正を加える
---

# pnpm の Patches

pnpm のパッチ機能を使うと、サードパーティパッケージを直接修正できる。上流のリリース前に修正を適用したり、パッケージの挙動をカスタマイズする際に有用である。

## パッチの作成

### Step 1: パッチを初期化

```bash
pnpm patch <pkg>@<version>

# 例
pnpm patch express@4.18.2
```

これにより、パッケージのソースを含む一時ディレクトリが作成され、そのパスが出力される。

```
You can now edit the following folder: /tmp/abc123...
```

### Step 2: ファイルを編集

一時ディレクトリへ移動し、必要な変更を加える。

```bash
cd /tmp/abc123...
# 必要に応じてファイルを編集
```

### Step 3: パッチをコミット

```bash
pnpm patch-commit <step1 で出力されたパス>

# 例
pnpm patch-commit /tmp/abc123...
```

これにより `patches/` 配下に `.patch` ファイルが作成され、`pnpm-workspace.yaml` に記録される。

```
patches/
└── express@4.18.2.patch
```

```yaml title="pnpm-workspace.yaml"
patchedDependencies:
  express@4.18.2: patches/express@4.18.2.patch
```

> `patchedDependencies` は他のすべての pnpm 設定と同様、`package.json#pnpm` フィールドではなく `pnpm-workspace.yaml` に置くようになった。

## パッチファイルの形式

パッチは標準の unified diff 形式である。

```diff
diff --git a/lib/router/index.js b/lib/router/index.js
index abc123..def456 100644
--- a/lib/router/index.js
+++ b/lib/router/index.js
@@ -100,6 +100,7 @@ function createRouter() {
   // Original code
-  const timeout = 30000;
+  const timeout = 60000; // Extended timeout
   return router;
 }
```

## パッチの管理

### パッチが当たっているパッケージを一覧表示

```bash
pnpm list --depth=0
# パッチ済みパッケージには (patched) マーカーが表示される
```

### パッチを更新

```bash
# 既存パッチを編集
pnpm patch express@4.18.2

# 編集が終わったら
pnpm patch-commit <path>
```

### パッチを削除

```bash
pnpm patch-remove <pkg>@<version>

# 例
pnpm patch-remove express@4.18.2
```

または手動で行う場合は、
1. `patches/` 配下のパッチファイルを削除
2. `pnpm-workspace.yaml` の `patchedDependencies` から該当エントリを削除
3. `pnpm install` を実行

## パッチの設定

### 複数パッケージと workspace

パッチはルートの `pnpm-workspace.yaml` から workspace 全体で共有される。

```yaml title="pnpm-workspace.yaml"
patchedDependencies:
  express@4.18.2: patches/express@4.18.2.patch
  lodash@4.17.21: patches/lodash@4.17.21.patch
  '@types/node@20.10.0': patches/@types__node@20.10.0.patch
```

`express:` のようにバージョンを付けないキーは、インストール済みのすべてのバージョンにパッチを当てる。一致するバージョンを使うすべての workspace パッケージにパッチが適用される。

### config dependency からのパッチ

パッチファイルは共有の config dependency 内に置き、パスで参照できる。

```yaml title="pnpm-workspace.yaml"
configDependencies:
  my-patches: '1.0.0'
patchedDependencies:
  react: node_modules/.pnpm-config/my-patches/react.patch
```

### allowUnusedPatches

```yaml title="pnpm-workspace.yaml"
allowUnusedPatches: true   # 列挙したパッチが未適用でも失敗しない
```

> `ignorePatchFailures` は v11 で削除された。適用に失敗したパッチは常にエラーを投げる。複数のパッチがまとめて処理される場合、すべてのエラーは最後に一括で報告される。

## ベストプラクティス

1. バージョンの厳密性: パッチは正確なバージョンに紐づく。依存をアップグレードする際はパッチも更新する。

2. パッチを文書化する: パッチの存在理由を説明するコメントを残す。
   ```bash
   # patches/README.md 内
   ## express@4.18.2.patch
   タイムアウト問題を修正。上流 PR は対応中: https://github.com/expressjs/express/pull/1234
   ```

3. パッチは最小限に: 小さく焦点を絞ったものにする。大きなパッチは保守が難しい。

4. 上流を追う: 上流の issue や PR を控えておき、修正されたらパッチを除去できるようにする。

5. パッチを検証する: パッチ済みコードが自分のユースケースで正しく動くことを確認する。

## トラブルシューティング

### パッチが適用できない

```
ERR_PNPM_PATCH_FAILED  Cannot apply patch
```

パッケージのバージョンが変わっている。パッチを作り直す。
```bash
pnpm patch-remove express@4.18.2
pnpm patch express@4.18.2
# 変更を再適用
pnpm patch-commit <path>
```

### パッチが適用されない

以下を確認する。
1. `patchedDependencies` のバージョンが、インストール済みバージョンと完全一致している
2. パッチ設定を追加した後に `pnpm install` を実行している

<!--
Source references:
- https://pnpm.io/cli/patch
- https://pnpm.io/cli/patch-commit
- https://pnpm.io/config-dependencies
-->
