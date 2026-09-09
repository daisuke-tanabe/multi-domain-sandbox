---
title: Use Prepared Statements Correctly with Pooling
impact: HIGH
impactDescription: pooling 環境での prepared statement 衝突を回避する
tags: prepared-statements, connection-pooling, transaction-mode
---

## Use Prepared Statements Correctly with Pooling

prepared statement は個別のデータベース接続に紐づく。transaction mode pooling では接続が共有されるため衝突が発生する。

誤り (transaction pooling で named prepared statement を使う):

```sql
-- named prepared statement
prepare get_user as select * from users where id = $1;

-- transaction mode pooling では次のリクエストで別の接続に割り当てられる可能性がある
execute get_user(123);
-- ERROR: prepared statement "get_user" does not exist
```

正しい例 (匿名 prepared statement を使うか session mode を選ぶ):

```sql
-- 選択肢 1: 匿名の prepared statement を使う (多くの ORM は自動的にこの方式)
-- 1 つのプロトコルメッセージで準備と実行をまとめて行う

-- 選択肢 2: transaction mode を使う場合は使用後に deallocate する
prepare get_user as select * from users where id = $1;
execute get_user(123);
deallocate get_user;

-- 選択肢 3: session mode pooling を使う (port 6543 ではなく 5432)
-- セッション中ずっと接続を保持するので prepared statement が維持される
```

ドライバの設定を確認する:

```sql
-- 多くのドライバはデフォルトで prepared statement を使う
-- Node.js pg: { prepare: false } で無効化
-- JDBC: prepareThreshold=0 で無効化
```

Reference: [Prepared Statements with Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pool-modes)
