# ブランチ戦略・命名・整理

## ブランチ戦略

### GitHub Flow（シンプル、ほとんどの場合に推奨）

継続的デプロイメントと中小規模チームに最適。

```
main (protected, always deployable)
  │
  ├── feature/user-auth      → PR → merge to main
  ├── feature/payment-flow   → PR → merge to main
  └── fix/login-bug          → PR → merge to main
```

ルール:
- `main` は常にデプロイ可能
- `main` から feature ブランチを作成する
- レビュー準備が整ったら Pull Request を開く
- 承認後にCIが通ったら `main` にマージする
- マージ直後にデプロイする

### Trunk-Based Development（高速度のチーム）

強力なCI/CDとフィーチャーフラグを持つチームに最適。

```
main (trunk)
  │
  ├── short-lived feature (1-2 days max)
  ├── short-lived feature
  └── short-lived feature
```

ルール:
- 全員が `main` または非常に短命なブランチにコミットする
- 未完成の作業はフィーチャーフラグで隠す
- マージ前にCIを通過させる
- 1日に複数回デプロイする

### GitFlow（複雑、リリースサイクル駆動）

定期リリースとエンタープライズプロジェクトに最適。

```
main (production releases)
  │
  └── develop (integration branch)
        │
        ├── feature/user-auth
        ├── feature/payment
        │
        ├── release/1.0.0    → merge to main and develop
        │
        └── hotfix/critical  → merge to main and develop
```

ルール:
- `main` は本番リリース用コードのみ
- `develop` は統合ブランチ
- feature ブランチは `develop` から切り、`develop` へマージ
- release ブランチは `develop` から切り、`main` と `develop` へマージ
- hotfix ブランチは `main` から切り、`main` と `develop` の両方へマージ

### どの戦略を選ぶか

| 戦略 | チームサイズ | リリース頻度 | 適した用途 |
|----------|-----------|-----------------|----------|
| GitHub Flow | 任意 | 継続的 | SaaS、Webアプリ、スタートアップ |
| Trunk-Based | 経験者5+ | 1日複数回 | 高速度チーム、フィーチャーフラグ |
| GitFlow | 10+ | スケジュール | エンタープライズ、規制業界 |

## 命名規則

```
# Feature branches
feature/user-authentication
feature/JIRA-123-payment-integration

# Bug fixes
fix/login-redirect-loop
fix/456-null-pointer-exception

# Hotfixes (production issues)
hotfix/critical-security-patch
hotfix/database-connection-leak

# Releases
release/1.2.0
release/2024-01-hotfix

# Experiments/POCs
experiment/new-caching-strategy
poc/graphql-migration
```

## ブランチクリーンアップ

```bash
# Delete local branches that are merged
git branch --merged main | grep -v "^\*\|main" | xargs -n 1 git branch -d

# Delete remote-tracking references for deleted remote branches
git fetch -p

# Delete local branch
git branch -d feature/user-auth  # Safe delete (only if merged)
git branch -D feature/user-auth  # Force delete

# Delete remote branch
git push origin --delete feature/user-auth
```

## Stash ワークフロー

```bash
# Save work in progress
git stash push -m "WIP: user authentication"

# List stashes
git stash list

# Apply most recent stash
git stash pop

# Apply specific stash
git stash apply stash@{2}

# Drop stash
git stash drop stash@{0}
```
