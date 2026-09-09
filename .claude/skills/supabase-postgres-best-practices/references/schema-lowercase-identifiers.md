---
title: Use Lowercase Identifiers for Compatibility
impact: MEDIUM
impactDescription: ツール、ORM、AI アシスタントとの大小文字によるバグを回避できる
tags: naming, identifiers, case-sensitivity, schema, conventions
---

## Use Lowercase Identifiers for Compatibility

PostgreSQL は引用符なしの識別子を小文字に畳み込む。引用符付きで大小文字を混在させると常に引用符が必要となり、ツールや ORM、AI アシスタントが認識できずに問題を引き起こす。

誤り (大小文字を混在させた識別子):

```sql
-- 引用符付き識別子は大小文字を保持するが、どこでも引用符が必須になる
CREATE TABLE "Users" (
  "userId" bigint PRIMARY KEY,
  "firstName" text,
  "lastName" text
);

-- 引用符を付けないとクエリが失敗する
SELECT "firstName" FROM "Users" WHERE "userId" = 1;

-- 失敗例 - 引用符を外すと Users は users に畳み込まれる
SELECT firstName FROM Users;
-- ERROR: relation "users" does not exist
```

正しい例 (lowercase snake_case):

```sql
-- 引用符なしの lowercase 識別子は可搬性があり、ツールにも優しい
CREATE TABLE users (
  user_id bigint PRIMARY KEY,
  first_name text,
  last_name text
);

-- 引用符なしで動作し、あらゆるツールから認識される
SELECT first_name FROM users WHERE user_id = 1;
```

大小文字混在の識別子が混入しがちな経路:

```sql
-- ORM は camelCase の引用符付き識別子を生成しやすい - snake_case を使うよう設定する
-- 別のデータベースからのマイグレーションは元の大小文字を保持しがち
-- 一部の GUI ツールはデフォルトで引用符を付与する - 無効化する

-- 大小文字混在から逃れられない場合は、互換レイヤとして view を作る
CREATE VIEW users AS SELECT "userId" AS user_id, "firstName" AS first_name FROM "Users";
```

Reference: [Identifiers and Key Words](https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS)
