# キャッシュ戦略

## Redis キャッシュレイヤー（Repository ラッパー）

既存 Repository を decorate してキャッシュを差し込む。利用側は変更不要。

```typescript
class CachedItemRepository implements ItemRepository {
  constructor(
    private baseRepo: ItemRepository,
    private redis: RedisClient
  ) {}

  async findById(id: string): Promise<Item | null> {
    // Check cache first
    const cached = await this.redis.get(`item:${id}`)

    if (cached) {
      return JSON.parse(cached)
    }

    // Cache miss - fetch from database
    const item = await this.baseRepo.findById(id)

    if (item) {
      // Cache for 5 minutes
      await this.redis.setex(`item:${id}`, 300, JSON.stringify(item))
    }

    return item
  }

  async invalidateCache(id: string): Promise<void> {
    await this.redis.del(`item:${id}`)
  }
}
```

## Cache-Aside パターン

呼び出し側がキャッシュ管理を意識する形。簡単に導入できるが、書き込み時の invalidate を忘れない。

```typescript
async function getItemWithCache(id: string): Promise<Item> {
  const cacheKey = `item:${id}`

  // Try cache
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  // Cache miss - fetch from DB
  const item = await db.items.findUnique({ where: { id } })

  if (!item) throw new Error('Item not found')

  // Update cache
  await redis.setex(cacheKey, 300, JSON.stringify(item))

  return item
}
```

## TTL の決め方

- データの鮮度要件 × 更新頻度 から逆算する
- 鮮度が必要 → TTL を短く（30〜60 秒）
- ほぼ静的 → TTL を長く（5〜60 分）
- 更新時に明示 invalidate するなら TTL は安全網程度に長め
