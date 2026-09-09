---
title: Maintain Table Statistics with VACUUM and ANALYZE
impact: MEDIUM
impactDescription: 統計が正確だとクエリプランが 2〜10 倍改善する
tags: vacuum, analyze, statistics, maintenance, autovacuum
---

## Maintain Table Statistics with VACUUM and ANALYZE

統計が古いままだとクエリプランナが誤った判断を下す。VACUUM は領域を回収し、ANALYZE は統計を更新する。

誤り (古い統計のまま):

```sql
-- テーブルには 1M 行あるのに、統計上は 1000 行と認識されている
-- クエリプランナが誤った戦略を選ぶ
explain select * from orders where status = 'pending';
-- 結果: Seq Scan (統計が小さいテーブルだと示しているため)
-- 実際は: Index Scan の方がずっと速い
```

正しい例 (統計を最新に保つ):

```sql
-- 大量のデータ変更があった後に手動で analyze する
analyze orders;

-- WHERE 句で利用するカラムを指定して analyze する
analyze orders (status, created_at);

-- 各テーブルが最後に analyze された時刻を確認する
select
  relname,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
from pg_stat_user_tables
order by last_analyze nulls first;
```

頻繁に更新されるテーブル向けの autovacuum チューニング:

```sql
-- 更新頻度が高いテーブルはより頻繁に autovacuum を実行する
alter table orders set (
  autovacuum_vacuum_scale_factor = 0.05,     -- dead tuple が 5% に達したら vacuum (デフォルト 20%)
  autovacuum_analyze_scale_factor = 0.02     -- 2% の変更で analyze (デフォルト 10%)
);

-- autovacuum の進捗を確認する
select * from pg_stat_progress_vacuum;
```

Reference: [VACUUM](https://supabase.com/docs/guides/database/database-size#vacuum-operations)
