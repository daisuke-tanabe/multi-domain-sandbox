# ページネーション・フィルタリング・ソート・検索

## ページネーション

### オフセットベース（シンプル）

```
GET /api/v1/users?page=2&per_page=20

# Implementation
SELECT * FROM users
ORDER BY created_at DESC
LIMIT 20 OFFSET 20;
```

長所: 実装が容易、「N ページにジャンプ」をサポート
短所: 大きなオフセット（OFFSET 100000）で遅い、同時挿入で不整合

### カーソルベース（スケーラブル）

```
GET /api/v1/users?cursor=eyJpZCI6MTIzfQ&limit=20

# Implementation
SELECT * FROM users
WHERE id > :cursor_id
ORDER BY id ASC
LIMIT 21;  -- fetch one extra to determine has_next
```

```json
{
  "data": [...],
  "meta": {
    "has_next": true,
    "next_cursor": "eyJpZCI6MTQzfQ"
  }
}
```

長所: 位置によらず一貫したパフォーマンス、同時挿入で安定
短所: 任意ページにジャンプできない、カーソルは不透明

### どちらを使うか

| ユースケース | ページネーションタイプ |
|----------|----------------|
| 管理ダッシュボード、小さなデータセット (<10K) | オフセット |
| 無限スクロール、フィード、大きなデータセット | カーソル |
| パブリック API | カーソル（デフォルト）+ オフセット（オプション） |
| 検索結果 | オフセット（ユーザーはページ番号を期待する） |

## フィルタリング

```
# Simple equality
GET /api/v1/orders?status=active&customer_id=abc-123

# Comparison operators (use bracket notation)
GET /api/v1/products?price[gte]=10&price[lte]=100
GET /api/v1/orders?created_at[after]=2025-01-01

# Multiple values (comma-separated)
GET /api/v1/products?category=electronics,clothing

# Nested fields (dot notation)
GET /api/v1/orders?customer.country=US
```

## ソート

```
# Single field (prefix - for descending)
GET /api/v1/products?sort=-created_at

# Multiple fields (comma-separated)
GET /api/v1/products?sort=-featured,price,-created_at
```

## 全文検索

```
# Search query parameter
GET /api/v1/products?q=wireless+headphones

# Field-specific search
GET /api/v1/users?email=alice
```

## スパースフィールドセット

ペイロードを小さくするため、必要なフィールドのみを返す。

```
# Return only specified fields
GET /api/v1/users?fields=id,name,email
GET /api/v1/orders?fields=id,total,status&include=customer.name
```
