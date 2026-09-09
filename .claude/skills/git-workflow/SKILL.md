---
name: git-workflow
description: ブランチ戦略、コミット規約、マージ vs リベース、コンフリクト解決、PR レビュー、リリース管理を含む Git ワークフローパターン。Git 操作・ブランチ作成・コミットメッセージ作成・PR 作成・マージ判断・リリース管理・履歴の取り消しを行う際は必ず本スキルを参照する。
metadata:
  source: "affaan-m/everything-claude-code@skills/git-workflow"
  sourceVersion: "d29cf651c795869f733669c33e3d33dfd8307d10"
---

# Git ワークフローパターン

Git バージョン管理、ブランチ戦略、共同開発のベストプラクティスを集約したクイックリファレンス。詳細手順・コマンド例は `references/` 配下を参照する。

## 起動タイミング

- 新しいプロジェクトの Git ワークフローをセットアップするとき
- ブランチ戦略（GitFlow、Trunk-Based、GitHub Flow）を決めるとき
- コミットメッセージや PR 説明を書くとき
- マージコンフリクトを解消するとき
- リリースとバージョンタグを管理するとき
- 新しいチームメンバーに Git の作法をオンボードするとき

## 主要原則

- `main` は常にデプロイ可能。直接コミットしない
- 作業は短命ブランチで行い、PR 経由で `main` にマージする
- コミットメッセージは Conventional Commits（`<type>(<scope>): <subject>`）に従う
- 共有済みブランチは rebase / force push しない（履歴を壊さない）
- PR は単一目的で 500 行以内が理想

## 戦略選択（GitHub Flow がデフォルト）

| 戦略 | チームサイズ | リリース頻度 | 適した用途 |
|----------|-----------|-----------------|----------|
| GitHub Flow | 任意 | 継続的 | SaaS、Web アプリ、スタートアップ |
| Trunk-Based | 経験者 5+ | 1 日複数回 | 高速度チーム、フィーチャーフラグ |
| GitFlow | 10+ | スケジュール | エンタープライズ、規制業界 |

迷ったら GitHub Flow。詳細は `references/branching.md` を参照。

## 詳細リファレンス

| トピック | ファイル |
|---|---|
| ブランチ戦略・命名・整理・Stash | `references/branching.md` |
| コミットメッセージ規約・マージ/リベース・コンフリクト解消 | `references/commits-and-merges.md` |
| プルリクエストの書き方・レビュー観点 | `references/pull-requests.md` |
| リリース管理（SemVer、タグ、Changelog） | `references/releases.md` |
| Git 設定・エイリアス・Gitignore・フック | `references/configuration.md` |
| 一般的なワークフロー・アンチパターン | `references/workflows.md` |

## クイックリファレンス

| タスク | コマンド |
|------|---------|
| ブランチ作成 | `git checkout -b feature/name` |
| ブランチ切替 | `git checkout branch-name` |
| ブランチ削除 | `git branch -d branch-name` |
| ブランチマージ | `git merge branch-name` |
| ブランチリベース | `git rebase main` |
| 履歴表示 | `git log --oneline --graph` |
| 差分表示 | `git diff` |
| 変更をステージ | `git add .` または `git add -p` |
| コミット | `git commit -m "message"` |
| プッシュ | `git push origin branch-name` |
| プル | `git pull origin branch-name` |
| Stash | `git stash push -m "message"` |
| 直前コミット取り消し | `git reset --soft HEAD~1` |
| コミットを revert | `git revert HEAD` |
