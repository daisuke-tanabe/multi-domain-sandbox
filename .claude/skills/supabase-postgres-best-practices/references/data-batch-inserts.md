---
title: Batch INSERT Statements for Bulk Data
impact: MEDIUM
impactDescription: 一括挿入で 10〜50 倍の高速化
tags: batch, insert, bulk, performance, copy
---

## Batch INSERT Statements for Bulk Data

INSERT 文を個別に実行するとオーバーヘッドが大きい。複数行を 1 文にまとめるか COPY を使う。

誤り (1 行ごとの insert):

```sql
-- それぞれの insert が独立したトランザクションとラウンドトリップを発生させる
insert into events (user_id, action) values (1, 'click');
insert into events (user_id, action) values (1, 'view');
insert into events (user_id, action) values (2, 'click');
-- ... さらに 1000 件の単一 insert を実行

-- 1000 件の insert = 1000 回のラウンドトリップ = 遅い
```

正しい例 (batch insert):

```sql
-- 1 つの文で複数行をまとめて挿入
insert into events (user_id, action) values
  (1, 'click'),
  (1, 'view'),
  (2, 'click'),
  -- ... 1 バッチあたり最大で約 1000 行までを目安に
  (999, 'view');

-- 1000 行を 1 回のラウンドトリップで処理できる
```

大量のインポートには COPY を使う:

```sql
-- bulk load なら COPY が最速
copy events (user_id, action, created_at)
from '/path/to/data.csv'
with (format csv, header true);

-- アプリケーション側の標準入力から流す場合
copy events (user_id, action) from stdin with (format csv);
1,click
1,view
2,click
\.
```

Reference: [COPY](https://www.postgresql.org/docs/current/sql-copy.html)
