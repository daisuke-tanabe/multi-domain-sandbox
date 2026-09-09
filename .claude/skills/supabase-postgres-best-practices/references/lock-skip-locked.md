---
title: Use SKIP LOCKED for Non-Blocking Queue Processing
impact: MEDIUM-HIGH
impactDescription: ワーカーキューのスループットが 10 倍に向上
tags: skip-locked, queue, workers, concurrency
---

## Use SKIP LOCKED for Non-Blocking Queue Processing

複数のワーカーがキューを処理する際、SKIP LOCKED を使うと待たずに別々の行を処理できる。

誤り (ワーカー同士が互いをブロックする):

```sql
-- Worker 1 と Worker 2 が両方とも次のジョブを取得しようとする
begin;
select * from jobs where status = 'pending' order by created_at limit 1 for update;
-- Worker 2 は Worker 1 のロックが解放されるのを待つ羽目になる!
```

正しい例 (SKIP LOCKED で並列に処理する):

```sql
-- 各ワーカーはロック済みの行をスキップして、次に利用可能な行を取得する
begin;
select * from jobs
where status = 'pending'
order by created_at
limit 1
for update skip locked;

-- Worker 1 はジョブ 1 を、Worker 2 はジョブ 2 を取得 (待ち時間なし)

update jobs set status = 'processing' where id = $1;
commit;
```

完全なキュー処理パターン:

```sql
-- 取得と更新を 1 文でアトミックに行う
update jobs
set status = 'processing', worker_id = $1, started_at = now()
where id = (
  select id from jobs
  where status = 'pending'
  order by created_at
  limit 1
  for update skip locked
)
returning *;
```

Reference: [SELECT FOR UPDATE SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
