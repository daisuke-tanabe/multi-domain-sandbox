---
title: 明確で動作指向のタイトル (例: "Use Partial Indexes for Filtered Queries")
impact: MEDIUM
impactDescription: フィルタ付きクエリで 5〜20 倍の高速化
tags: indexes, query-optimization, performance
---

## [ルールのタイトル]

[問題と、それがなぜ重要なのかを 1〜2 文で説明する。パフォーマンスへの影響に焦点を当てる。]

誤り (問題点を説明する):

```sql
-- このクエリが遅い/問題となる理由をコメントで説明する
CREATE INDEX users_email_idx ON users(email);

SELECT * FROM users WHERE email = 'user@example.com' AND deleted_at IS NULL;
-- 削除済みレコードまで不要にスキャンしてしまう
```

正しい例 (解決策を説明する):

```sql
-- なぜこちらが良いのかをコメントで説明する
CREATE INDEX users_active_email_idx ON users(email) WHERE deleted_at IS NULL;

SELECT * FROM users WHERE email = 'user@example.com' AND deleted_at IS NULL;
-- アクティブユーザーのみインデックス化することで、インデックスサイズは 10 分の 1、クエリも高速
```

[任意: 補足コンテキスト、エッジケース、トレードオフを記載する]

Reference: [Postgres Docs](https://www.postgresql.org/docs/current/)
