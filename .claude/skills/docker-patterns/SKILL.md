---
name: docker-patterns
description: ローカル開発、コンテナセキュリティ、ネットワーキング、ボリューム戦略、マルチサービスのオーケストレーションのための Docker および Docker Compose パターン。Docker Compose 構築・Dockerfile 作成/レビュー・コンテナセキュリティ強化・ネットワーク/ボリュームのトラブルシューティング・本番ワークフロー設計を行う際は必ず本スキルを参照する。
metadata:
  source: "affaan-m/everything-claude-code@skills/docker-patterns"
  sourceVersion: "d791457aca159f862358f05aef3a7f588416a2dc"
  sourceNote: "upstream の Hardened CLI Installer Harnesses 節は ECC リポジトリ固有のため、汎用部分のみ references/security.md に取り込む"
---

# Docker パターン

コンテナ化開発のための Docker と Docker Compose のベストプラクティス。詳細は `references/` 配下を参照する。

## 起動タイミング

- ローカル開発向けに Docker Compose を構築するとき
- マルチコンテナアーキテクチャを設計するとき
- Dockerfile のセキュリティとサイズをレビューするとき
- コンテナのネットワーキングやボリュームの問題を切り分けるとき
- ローカル開発からコンテナ化ワークフローへ移行するとき
- インストーラや CLI を複数の Linux ディストリビューションで検証するとき

## 主要原則

- マルチステージビルド: dev / build / production を分け、本番イメージを最小化する
- 非 root で実行: 専用ユーザーを作成し `USER` 指定。`cap_drop: [ALL]` で権限を剥がす
- タグはピン留め: `:latest` を避け、`node:22.12-alpine3.20` のように具体的に指定
- シークレットを焼かない: `ENV API_KEY=...` 禁止。`.env` ファイルか Docker secrets を使う
- ボリュームでデータを永続化: コンテナは ephemeral。データは named volume / bind mount に逃がす
- ネットワーク分離: フロント／API／DB を別ネットワークに分け、必要な接続だけ許可する
- 不要なポートは公開しない: 本番では `ports:` を省略してホストへの露出を消す

## 詳細リファレンス

| トピック | ファイル |
|---|---|
| Docker Compose 構成、マルチステージ Dockerfile、Override ファイル | `references/compose-and-dockerfile.md` |
| ネットワーキング（サービスディスカバリ／カスタムネットワーク）とボリューム戦略 | `references/networking-and-volumes.md` |
| コンテナセキュリティ（ハードニング、シークレット管理、.dockerignore、インストーラ検証） | `references/security.md` |
| デバッグコマンド・ネットワーク調査・アンチパターン | `references/debugging.md` |
