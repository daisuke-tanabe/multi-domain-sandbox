# コミットメッセージ・マージ/リベース・コンフリクト

## Conventional Commits フォーマット

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### タイプ

| タイプ | 用途 | 例 |
|------|---------|---------|
| `feat` | 新機能 | `feat(auth): add OAuth2 login` |
| `fix` | バグ修正 | `fix(api): handle null response in user endpoint` |
| `docs` | ドキュメント | `docs(readme): update installation instructions` |
| `style` | フォーマット、コード変更なし | `style: fix indentation in login component` |
| `refactor` | リファクタリング | `refactor(db): extract connection pool to module` |
| `test` | テスト追加・更新 | `test(auth): add unit tests for token validation` |
| `chore` | 保守作業 | `chore(deps): update dependencies` |
| `perf` | パフォーマンス改善 | `perf(query): add index to users table` |
| `ci` | CI/CD変更 | `ci: add PostgreSQL service to test workflow` |
| `revert` | 過去のコミット取り消し | `revert: revert "feat(auth): add OAuth2 login"` |

### 良い例 vs 悪い例

```
# BAD: Vague, no context
git commit -m "fixed stuff"
git commit -m "updates"
git commit -m "WIP"

# GOOD: Clear, specific, explains why
git commit -m "fix(api): retry requests on 503 Service Unavailable

The external API occasionally returns 503 errors during peak hours.
Added exponential backoff retry logic with max 3 attempts.

Closes #123"
```

### コミットメッセージテンプレート

リポジトリルートに `.gitmessage` を作成する:

```
# <type>(<scope>): <subject>
# # Types: feat, fix, docs, style, refactor, test, chore, perf, ci, revert
# Scope: api, ui, db, auth, etc.
# Subject: imperative mood, no period, max 50 chars
#
# [optional body] - explain why, not what
# [optional footer] - Breaking changes, closes #issue
```

有効化: `git config commit.template .gitmessage`

## マージ vs リベース

### マージ（履歴を保持）

```bash
# Creates a merge commit
git checkout main
git merge feature/user-auth

# Result:
# *   merge commit
# |\
# | * feature commits
# |/
# * main commits
```

使うとき:
- feature ブランチを `main` にマージするとき
- 履歴を正確に保ちたいとき
- 複数人がブランチで作業したとき
- ブランチがプッシュ済みで他者がそれを基に作業している可能性があるとき

### リベース（線形履歴）

```bash
# Rewrites feature commits onto target branch
git checkout feature/user-auth
git rebase main

# Result:
# * feature commits (rewritten)
# * main commits
```

使うとき:
- ローカルのfeatureブランチを最新の `main` で更新するとき
- 線形でクリーンな履歴が欲しいとき
- ブランチがローカル限定（プッシュされていない）のとき
- 自分だけがブランチで作業しているとき

### リベースワークフロー

```bash
# Update feature branch with latest main (before PR)
git checkout feature/user-auth
git fetch origin
git rebase origin/main

# Fix any conflicts
# Tests should still pass

# Force push (only if you're the only contributor)
git push --force-with-lease origin feature/user-auth
```

### リベースしてはいけないとき

```
# NEVER rebase branches that:
- Have been pushed to a shared repository
- Other people have based work on
- Are protected branches (main, develop)
- Are already merged

# Why: Rebase rewrites history, breaking others' work
```

## コンフリクト解消

### 検出

```bash
# Check for conflicts before merge
git checkout main
git merge feature/user-auth --no-commit --no-ff

# If conflicts, Git will show:
# CONFLICT (content): Merge conflict in src/auth/login.ts
# Automatic merge failed; fix conflicts and then commit the result.
```

### 解決

```bash
# See conflicted files
git status

# View conflict markers in file
# <<<<<<< HEAD
# content from main
# =======
# content from feature branch
# >>>>>>> feature/user-auth

# Option 1: Manual resolution
# Edit file, remove markers, keep correct content

# Option 2: Use merge tool
git mergetool

# Option 3: Accept one side
git checkout --ours src/auth/login.ts    # Keep main version
git checkout --theirs src/auth/login.ts  # Keep feature version

# After resolving, stage and commit
git add src/auth/login.ts
git commit
```

### 予防戦略

```bash
# 1. Keep feature branches small and short-lived
# 2. Rebase frequently onto main
git checkout feature/user-auth
git fetch origin
git rebase origin/main

# 3. Communicate with team about touching shared files
# 4. Use feature flags instead of long-lived branches
# 5. Review and merge PRs promptly
```
