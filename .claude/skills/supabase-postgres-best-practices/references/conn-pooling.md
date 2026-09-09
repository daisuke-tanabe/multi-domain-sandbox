---
title: Use Connection Pooling for All Applications
impact: CRITICAL
impactDescription: 同時接続ユーザー数を 10〜100 倍さばけるようになる
tags: connection-pooling, pgbouncer, performance, scalability
---

## Use Connection Pooling for All Applications

Postgres の接続は高コスト (1 接続あたり 1〜3MB の RAM) である。pooling を使わないと、負荷下でアプリケーションが接続を使い切ってしまう。

誤り (リクエストごとに新しい接続を作る):

```sql
-- リクエストごとに新しい接続を生成
-- アプリケーションコード: リクエストのたびに db.connect()
-- 結果: 500 同時接続ユーザー = 500 コネクション = データベースが落ちる

-- 現在の接続数を確認
select count(*) from pg_stat_activity;  -- 487 接続!
```

正しい例 (connection pool を利用する):

```sql
-- アプリとデータベースの間に PgBouncer のような pooler を挟む
-- アプリは pooler に接続し、pooler は小さな pool で Postgres への接続を使い回す

-- pool_size は (CPU コア数 × 2) + spindle 数 を目安に設定する
-- 4 コアの例: pool_size = 10

-- 結果: 500 同時接続ユーザーが実際の 10 接続を共有する
select count(*) from pg_stat_activity;  -- 10 接続
```

pool モード:

- Transaction mode: トランザクションごとに接続を返却する (多くのアプリに最適)
- Session mode: セッション中ずっと接続を保持する (prepared statement や temp table が必要なケース向け)

Reference: [Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
