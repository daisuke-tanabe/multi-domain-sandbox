---
title: Enable pg_stat_statements for Query Analysis
impact: LOW-MEDIUM
impactDescription: 最も負荷の高いクエリを特定できる
tags: pg-stat-statements, monitoring, statistics, performance
---

## Enable pg_stat_statements for Query Analysis

pg_stat_statements はすべてのクエリの実行統計を記録し、遅いクエリや頻発するクエリの特定に役立つ。

誤り (クエリの傾向が分からない):

```sql
-- データベースが遅いが、どのクエリが問題か分からない
-- pg_stat_statements がないと判断できない
```

正しい例 (pg_stat_statements を有効化して問い合わせる):

```sql
-- 拡張を有効化
create extension if not exists pg_stat_statements;

-- 累積実行時間が最大のクエリを取得
select
  calls,
  round(total_exec_time::numeric, 2) as total_time_ms,
  round(mean_exec_time::numeric, 2) as mean_time_ms,
  query
from pg_stat_statements
order by total_exec_time desc
limit 10;

-- 呼び出し回数が多いクエリを取得
select calls, query
from pg_stat_statements
order by calls desc
limit 10;

-- 最適化後に統計をリセット
select pg_stat_statements_reset();
```

監視すべき主要メトリクス:

```sql
-- 平均実行時間が長いクエリ (最適化候補)
select query, mean_exec_time, calls
from pg_stat_statements
where mean_exec_time > 100  -- 平均 100ms 超
order by mean_exec_time desc;
```

Reference: [pg_stat_statements](https://supabase.com/docs/guides/database/extensions/pg_stat_statements)
