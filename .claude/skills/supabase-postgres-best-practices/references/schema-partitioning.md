---
title: Partition Large Tables for Better Performance
impact: MEDIUM-HIGH
impactDescription: 大規模テーブルでクエリと運用が 5〜20 倍高速化
tags: partitioning, large-tables, time-series, performance
---

## Partition Large Tables for Better Performance

partitioning は大規模テーブルを小さな単位に分割し、クエリ性能とメンテナンス性を向上させる。

誤り (単一の巨大テーブル):

```sql
create table events (
  id bigint generated always as identity,
  created_at timestamptz,
  data jsonb
);

-- 5 億行あり、クエリは全件スキャンされる
select * from events where created_at > '2024-01-01';  -- 遅い
vacuum events;  -- 何時間もかかり、テーブルがロックされる
```

正しい例 (日時範囲で partitioning):

```sql
create table events (
  id bigint generated always as identity,
  created_at timestamptz not null,
  data jsonb
) partition by range (created_at);

-- 月ごとにパーティションを作成する
create table events_2024_01 partition of events
  for values from ('2024-01-01') to ('2024-02-01');

create table events_2024_02 partition of events
  for values from ('2024-02-01') to ('2024-03-01');

-- クエリは関連するパーティションだけをスキャンする
select * from events where created_at > '2024-01-15';  -- events_2024_01 以降のみスキャン

-- 古いデータを瞬時に削除できる
drop table events_2023_01;  -- DELETE では何時間もかかるが、こちらは即時
```

partitioning を検討すべきとき:

- 行数が 1 億を超えるテーブル
- 日時ベースでクエリする時系列データ
- 古いデータを効率的に削除したいケース

Reference: [Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
