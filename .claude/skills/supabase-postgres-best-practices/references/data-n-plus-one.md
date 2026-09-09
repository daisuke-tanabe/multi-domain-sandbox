---
title: Eliminate N+1 Queries with Batch Loading
impact: MEDIUM-HIGH
impactDescription: データベースへのラウンドトリップが 10〜100 分の 1 に減少
tags: n-plus-one, batch, performance, queries
---

## Eliminate N+1 Queries with Batch Loading

N+1 クエリはループ内で要素ごとに 1 つずつクエリを発行する。配列や JOIN を使って 1 回のクエリにまとめる。

誤り (N+1 クエリ):

```sql
-- 最初のクエリ: 全ユーザーを取得
select id from users where active = true;  -- 100 件の ID が返る

-- そのあとユーザーごとに N 回のクエリ
select * from orders where user_id = 1;
select * from orders where user_id = 2;
select * from orders where user_id = 3;
-- ... さらに 97 クエリ!

-- 合計: データベースへのラウンドトリップが 101 回
```

正しい例 (1 回のバッチクエリ):

```sql
-- ID を集めて ANY で一度に問い合わせる
select * from orders where user_id = any(array[1, 2, 3, ...]);

-- ループの代わりに JOIN を使う
select u.id, u.name, o.*
from users u
left join orders o on o.user_id = u.id
where u.active = true;

-- 合計: ラウンドトリップは 1 回
```

アプリケーション側のパターン:

```sql
-- アプリケーションコードでループする代わりに:
-- for user in users: db.query("SELECT * FROM orders WHERE user_id = $1", user.id)

-- 配列パラメータを渡す:
select * from orders where user_id = any($1::bigint[]);
-- アプリは [1, 2, 3, 4, 5, ...] を渡す
```

Reference: [N+1 Query Problem](https://supabase.com/docs/guides/database/query-optimization)
