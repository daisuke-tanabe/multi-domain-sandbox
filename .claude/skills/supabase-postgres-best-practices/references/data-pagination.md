---
title: Use Cursor-Based Pagination Instead of OFFSET
impact: MEDIUM-HIGH
impactDescription: ページの深さに関係なく一定 (O(1)) のパフォーマンス
tags: pagination, cursor, keyset, offset, performance
---

## Use Cursor-Based Pagination Instead of OFFSET

OFFSET によるページネーションはスキップする行をすべて走査するため、深いページほど遅くなる。cursor ベースのページネーションは O(1) で動作する。

誤り (OFFSET ページネーション):

```sql
-- 1 ページ目: 20 行をスキャン
select * from products order by id limit 20 offset 0;

-- 100 ページ目: 2000 行スキャンして 1980 行をスキップ
select * from products order by id limit 20 offset 1980;

-- 10000 ページ目: 200,000 行のスキャンが必要!
select * from products order by id limit 20 offset 199980;
```

正しい例 (cursor / keyset ページネーション):

```sql
-- 1 ページ目: 先頭から 20 件取得
select * from products order by id limit 20;
-- アプリ側で last_id = 20 を保持

-- 2 ページ目: 直前の ID より後ろから取得
select * from products where id > 20 order by id limit 20;
-- インデックスを使うため、何ページ目でも常に高速

-- 10000 ページ目: 1 ページ目と同じ速度で取得できる
select * from products where id > 199980 order by id limit 20;
```

複数カラムでソートする場合:

```sql
-- cursor にはソート対象のすべてのカラムを含める
select * from products
where (created_at, id) > ('2024-01-15 10:00:00', 12345)
order by created_at, id
limit 20;
```

Reference: [Pagination](https://supabase.com/docs/guides/database/pagination)
