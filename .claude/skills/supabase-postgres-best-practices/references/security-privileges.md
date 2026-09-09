---
title: Apply Principle of Least Privilege
impact: MEDIUM
impactDescription: 攻撃面が縮小し、監査もしやすくなる
tags: privileges, security, roles, permissions
---

## Apply Principle of Least Privilege

必要最小限の権限のみ付与する。アプリケーションのクエリで superuser を使わない。

誤り (権限を広く与えすぎる):

```sql
-- アプリケーションが superuser 接続を使う
-- もしくはアプリケーションロールに ALL を付与してしまう
grant all privileges on all tables in schema public to app_user;
grant all privileges on all sequences in schema public to app_user;

-- SQL インジェクションが致命的なものに発展する
-- drop table users; があらゆるテーブルへ波及する
```

正しい例 (最小かつ具体的な権限付与):

```sql
-- デフォルト権限を持たないロールを作成する
create role app_readonly nologin;

-- 特定テーブルに対してのみ SELECT を許可する
grant usage on schema public to app_readonly;
grant select on public.products, public.categories to app_readonly;

-- 範囲を絞った書き込み用のロールを作る
create role app_writer nologin;
grant usage on schema public to app_writer;
grant select, insert, update on public.orders to app_writer;
grant usage on sequence orders_id_seq to app_writer;
-- DELETE 権限は付与しない

-- ログインロールが上記を継承する
create role app_user login password 'xxx';
grant app_writer to app_user;
```

public の既定権限を取り除く:

```sql
-- public への既定アクセスを無効化する
revoke all on schema public from public;
revoke all on all tables in schema public from public;
```

Reference: [Roles and Privileges](https://supabase.com/blog/postgres-roles-and-privileges)
