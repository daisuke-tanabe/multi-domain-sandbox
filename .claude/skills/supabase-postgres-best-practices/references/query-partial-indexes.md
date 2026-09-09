---
title: Use Partial Indexes for Filtered Queries
impact: HIGH
impactDescription: インデックスサイズが 5〜20 分の 1、書き込みもクエリも高速化
tags: indexes, partial-index, query-optimization, storage
---

## Use Partial Indexes for Filtered Queries

partial index は WHERE 条件を満たす行だけを対象にするインデックスで、特定条件で常に絞り込むクエリではより小さく速くなる。

誤り (フルインデックスは不要な行まで含む):

```sql
-- 論理削除された行も含めてすべてインデックスに入る
create index users_email_idx on users (email);

-- クエリは常にアクティブなユーザーで絞り込む
select * from users where email = 'user@example.com' and deleted_at is null;
```

正しい例 (クエリのフィルタに合わせた partial index):

```sql
-- アクティブなユーザーだけをインデックスに含める
create index users_active_email_idx on users (email)
where deleted_at is null;

-- クエリは小さく高速なインデックスを利用する
select * from users where email = 'user@example.com' and deleted_at is null;
```

partial index のよくあるユースケース:

```sql
-- 完了後はステータスがほとんど変わらない pending な注文のみ
create index orders_pending_idx on orders (created_at)
where status = 'pending';

-- NULL 以外の値のみ
create index products_sku_idx on products (sku)
where sku is not null;
```

Reference: [Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
