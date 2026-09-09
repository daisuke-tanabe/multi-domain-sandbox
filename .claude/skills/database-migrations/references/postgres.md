# PostgreSQL マイグレーションパターン（生 SQL）

## カラムの安全な追加

```sql
-- GOOD: ヌラブルカラム、ロックなし
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- GOOD: デフォルト付きカラム（Postgres 11+ では即時、リライトなし）
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- BAD: 既存テーブルにデフォルトなしの NOT NULL（フルリライトが必要）
ALTER TABLE users ADD COLUMN role TEXT NOT NULL;
-- これはテーブルをロックしてすべての行をリライトする
```

## ダウンタイムなしのインデックス追加

```sql
-- BAD: 大きなテーブルで書き込みをブロック
CREATE INDEX idx_users_email ON users (email);

-- GOOD: ノンブロッキング、並行書き込みを許可
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

-- 注意: CONCURRENTLY はトランザクションブロック内で実行できない
-- ほとんどのマイグレーションツールはこれに特別な処理が必要
```

## カラムのリネーム（ゼロダウンタイム）

本番で直接リネームしない。expand-contract パターンを使う:

```sql
-- Step 1: 新カラムを追加（migration 001）
ALTER TABLE users ADD COLUMN display_name TEXT;

-- Step 2: データをバックフィル（migration 002、データマイグレーション）
UPDATE users SET display_name = username WHERE display_name IS NULL;

-- Step 3: アプリコードを両カラムを read/write するよう更新
-- アプリ変更をデプロイ

-- Step 4: 旧カラムへの書き込みを停止、ドロップ（migration 003）
ALTER TABLE users DROP COLUMN username;
```

## カラムの安全な削除

```sql
-- Step 1: アプリのカラム参照をすべて削除
-- Step 2: カラム参照なしでアプリをデプロイ
-- Step 3: 次のマイグレーションでカラムをドロップ
ALTER TABLE orders DROP COLUMN legacy_status;
```

## 大規模なデータマイグレーション

```sql
-- BAD: 1 トランザクションで全行を更新（テーブルロック）
UPDATE users SET normalized_email = LOWER(email);

-- GOOD: 進捗付きバッチ更新
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE users
    SET normalized_email = LOWER(email)
    WHERE id IN (
      SELECT id FROM users
      WHERE normalized_email IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RAISE NOTICE 'Updated % rows', rows_updated;
    EXIT WHEN rows_updated = 0;
    COMMIT;
  END LOOP;
END $$;
```
