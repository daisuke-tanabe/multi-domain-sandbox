---
title: Keep Transactions Short to Reduce Lock Contention
impact: MEDIUM-HIGH
impactDescription: スループットが 3〜5 倍向上し、deadlock も減少
tags: transactions, locking, contention, performance
---

## Keep Transactions Short to Reduce Lock Contention

長時間にわたるトランザクションは他のクエリをブロックするロックを保持し続ける。トランザクションはできるだけ短く保つ。

誤り (外部呼び出しを含む長いトランザクション):

```sql
begin;
select * from orders where id = 1 for update;  -- ロック取得

-- アプリが決済 API へ HTTP リクエスト (2〜5 秒)
-- この間、同じ行へのクエリはすべてブロックされる!

update orders set status = 'paid' where id = 1;
commit;  -- ロックがこの間ずっと保持される
```

正しい例 (トランザクションの範囲を最小化する):

```sql
-- データの検証や API 呼び出しはトランザクションの外で行う
-- アプリ側: response = await paymentAPI.charge(...)

-- 実際の更新時だけロックを保持する
begin;
update orders
set status = 'paid', payment_id = $1
where id = $2 and status = 'pending'
returning *;
commit;  -- ロック保持はミリ秒単位で完了
```

暴走を防ぐために `statement_timeout` を設定する:

```sql
-- 30 秒以上動作するクエリを中断する
set statement_timeout = '30s';

-- セッション単位で設定する場合
set local statement_timeout = '5s';
```

Reference: [Transaction Management](https://www.postgresql.org/docs/current/tutorial-transactions.html)
