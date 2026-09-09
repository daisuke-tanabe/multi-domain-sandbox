---
title: Choose the Right Index Type for Your Data
impact: HIGH
impactDescription: 適切なインデックス種別を選ぶことで 10〜100 倍高速化
tags: indexes, btree, gin, gist, brin, hash, index-types
---

## Choose the Right Index Type for Your Data

クエリのパターンによって得意なインデックス種別は異なる。デフォルトの B-tree が常に最適とは限らない。

誤り (JSONB の containment に B-tree を使う):

```sql
-- B-tree は containment 演算子を最適化できない
create index products_attrs_idx on products (attributes);
select * from products where attributes @> '{"color": "red"}';
-- フルテーブルスキャンとなる - B-tree は @> 演算子をサポートしない
```

正しい例 (JSONB には GIN):

```sql
-- GIN は @>, ?, ?&, ?| 演算子をサポートする
create index products_attrs_idx on products using gin (attributes);
select * from products where attributes @> '{"color": "red"}';
```

インデックス種別の指針:

```sql
-- B-tree (デフォルト): =, <, >, BETWEEN, IN, IS NULL
create index users_created_idx on users (created_at);

-- GIN: 配列、JSONB、full text search
create index posts_tags_idx on posts using gin (tags);

-- GiST: 幾何データ、range 型、近傍検索 (KNN)
create index locations_idx on places using gist (location);

-- BRIN: 大規模な時系列テーブル (10〜100 倍小さい)
create index events_time_idx on events using brin (created_at);

-- Hash: 等価比較のみ (B-tree より = がわずかに速い)
create index sessions_token_idx on sessions using hash (token);
```

Reference: [Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
