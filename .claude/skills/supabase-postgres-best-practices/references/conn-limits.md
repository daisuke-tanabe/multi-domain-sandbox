---
title: Set Appropriate Connection Limits
impact: CRITICAL
impactDescription: データベースのクラッシュやメモリ枯渇を防ぐ
tags: connections, max-connections, limits, stability
---

## Set Appropriate Connection Limits

接続数が多すぎるとメモリを使い切り、パフォーマンスが低下する。利用可能リソースに応じて上限を設定する。

誤り (接続数の上限がない、または過剰):

```sql
-- デフォルトの max_connections は 100 だが、安易に増やされがち
show max_connections;  -- 500 (4GB RAM では多すぎる)

-- 1 接続あたり 1〜3MB のメモリを消費
-- 500 接続 × 2MB = 接続だけで 1GB を消費!
-- 高負荷時にメモリ不足エラーになる
```

正しい例 (リソースを元に算出する):

```sql
-- 計算式: max_connections = (RAM のメガバイト / 接続あたり 5MB) - 予約分
-- 4GB RAM の場合: (4096 / 5) - 10 = 理論上は約 800 が上限
-- 実用上はクエリ性能の観点から 100〜200 が望ましい

-- 4GB RAM 向けの推奨設定
alter system set max_connections = 100;

-- work_mem も併せて適切に設定する
-- work_mem × max_connections が RAM の 25% を超えないようにする
alter system set work_mem = '8MB';  -- 8MB × 100 = 最大 800MB
```

接続数の利用状況を監視する:

```sql
select count(*), state from pg_stat_activity group by state;
```

Reference: [Database Connections](https://supabase.com/docs/guides/platform/performance#connection-management)
