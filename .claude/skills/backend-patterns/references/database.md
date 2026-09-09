# データベースパターン

## クエリ最適化

必要なカラムのみ選択し、`SELECT *` を避ける。インデックスが効く WHERE / ORDER BY を意識する。

```typescript
// PASS: GOOD: Select only needed columns
const { data } = await supabase
  .from('items')
  .select('id, name, status, score')
  .eq('status', 'active')
  .order('score', { ascending: false })
  .limit(10)

// FAIL: BAD: Select everything
const { data } = await supabase
  .from('items')
  .select('*')
```

## N+1 クエリの防止

ループ内で 1 件ずつフェッチしない。ID をまとめて 1 クエリで取得し、Map で結合する。

```typescript
// FAIL: BAD: N+1 query problem
const items = await getItems()
for (const item of items) {
  item.creator = await getUser(item.creator_id)  // N queries
}

// PASS: GOOD: Batch fetch
const items = await getItems()
const creatorIds = items.map(m => m.creator_id)
const creators = await getUsers(creatorIds)  // 1 query
const creatorMap = new Map(creators.map(c => [c.id, c]))

items.forEach(item => {
  item.creator = creatorMap.get(item.creator_id)
})
```

## トランザクションパターン

複数テーブルにまたがる書き込みは原子的に扱う。Supabase なら RPC（PL/pgSQL ストアド関数）に閉じ込めるのが確実。

```typescript
async function createItemWithRelated(
  itemData: CreateItemDto,
  relatedData: CreateRelatedDto
) {
  // Use Supabase transaction
  const { data, error } = await supabase.rpc('create_item_with_related', {
    item_data: itemData,
    related_data: relatedData
  })

  if (error) throw new Error('Transaction failed')
  return data
}

// SQL function in Supabase
CREATE OR REPLACE FUNCTION create_item_with_related(
  item_data jsonb,
  related_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  -- Start transaction automatically
  INSERT INTO items VALUES (item_data);
  INSERT INTO related VALUES (related_data);
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback happens automatically
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```
