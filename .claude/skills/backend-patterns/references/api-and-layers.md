# API 設計とレイヤー分割

## RESTful API 構造

```typescript
// PASS: Resource-based URLs
GET    /api/items                   # List resources
GET    /api/items/:id               # Get single resource
POST   /api/items                   # Create resource
PUT    /api/items/:id               # Replace resource
PATCH  /api/items/:id               # Update resource
DELETE /api/items/:id               # Delete resource

// PASS: Query parameters for filtering, sorting, pagination
GET /api/items?status=active&sort=score&limit=20&offset=0
```

## Repository パターン

データアクセスを抽象化する。テスト容易性とストレージ切り替えのしやすさが目的。

```typescript
// Abstract data access logic
interface ItemRepository {
  findAll(filters?: ItemFilters): Promise<Item[]>
  findById(id: string): Promise<Item | null>
  create(data: CreateItemDto): Promise<Item>
  update(id: string, data: UpdateItemDto): Promise<Item>
  delete(id: string): Promise<void>
}

class SupabaseItemRepository implements ItemRepository {
  async findAll(filters?: ItemFilters): Promise<Item[]> {
    let query = supabase.from('items').select('*')

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) throw new Error(error.message)
    return data
  }

  // Other methods...
}
```

## Service レイヤーパターン

ビジネスロジックをデータアクセス層から分離する。複数 Repository をまたぐ調整や、ドメイン特有のルールを置く場所。

```typescript
class ItemService {
  constructor(private itemRepo: ItemRepository) {}

  async searchItems(query: string, limit: number = 10): Promise<Item[]> {
    // Business logic
    const embedding = await generateEmbedding(query)
    const results = await this.vectorSearch(embedding, limit)

    // Fetch full data
    const items = await this.itemRepo.findByIds(results.map(r => r.id))

    // Sort by similarity
    return items.sort((a, b) => {
      const scoreA = results.find(r => r.id === a.id)?.score || 0
      const scoreB = results.find(r => r.id === b.id)?.score || 0
      return scoreA - scoreB
    })
  }

  private async vectorSearch(embedding: number[], limit: number) {
    // Vector search implementation
  }
}
```

## Middleware パターン

認証・ロギング・バリデーションなど、複数ハンドラ共通の前処理を高階関数で合成する。

```typescript
// Request/response processing pipeline
export function withAuth(handler: NextApiHandler): NextApiHandler {
  return async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      const user = await verifyToken(token)
      req.user = user
      return handler(req, res)
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}

// Usage
export default withAuth(async (req, res) => {
  // Handler has access to req.user
})
```
