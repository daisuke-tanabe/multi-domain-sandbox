---
title: Select Optimal Primary Key Strategy
impact: HIGH
impactDescription: インデックス局所性が向上し、フラグメンテーションが減る
tags: primary-key, identity, uuid, serial, schema
---

## Select Optimal Primary Key Strategy

primary key の選択は、insert 性能、インデックスサイズ、レプリケーション効率に影響する。

誤り (問題のある primary key 選択):

```sql
-- identity は SQL 標準のアプローチ
create table users (
  id serial primary key  -- 動くが、IDENTITY を推奨
);

-- ランダムな UUID (v4) はインデックスを断片化させる
create table orders (
  id uuid default gen_random_uuid() primary key  -- UUIDv4 はランダムで insert が分散する
);
```

正しい例 (最適な primary key 戦略):

```sql
-- 連番 ID には IDENTITY を使う (SQL 標準で大半のケースで最適)
create table users (
  id bigint generated always as identity primary key
);

-- 分散システムで UUID が必要な場合は UUIDv7 (時系列順) を使う
-- pg_uuidv7 拡張が必要: create extension pg_uuidv7;
create table orders (
  id uuid default uuid_generate_v7() primary key  -- 時系列順で断片化しない
);

-- 代替案: ソート可能な分散 ID を拡張なしで実現するため、時刻プレフィックス付き ID を使う
create table events (
  id text default concat(
    to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISSMS'),
    gen_random_uuid()::text
  ) primary key
);
```

ガイドライン:

- 単一データベース: `bigint identity` (連番、8 バイト、SQL 標準)
- 分散システム／外部公開する ID: UUIDv7 (pg_uuidv7 が必要) や ULID (時系列順で断片化しない)
- `serial` も動作するが、新規アプリケーションでは SQL 標準の `identity` が推奨
- 大規模テーブルでランダム UUID (v4) を primary key にするのは避ける (インデックスが断片化する)

Reference:
[Identity Columns](https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-PARMS-GENERATED-IDENTITY)
