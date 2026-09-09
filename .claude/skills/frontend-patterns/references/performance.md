# パフォーマンス最適化

## メモ化

重い計算と再生成されたくないコールバックは `useMemo` / `useCallback`、純粋なコンポーネントは `React.memo` でメモ化する。乱用するとオーバーヘッドが上回るので、計測してから適用する。

```typescript
// PASS: useMemo for expensive computations
// sort 前にコピーする。Array.prototype.sort は元の配列を破壊的に変更する
const sortedItems = useMemo(() => {
  return [...items].sort((a, b) => b.score - a.score)
}, [items])

// PASS: useCallback for functions passed to children
const handleSearch = useCallback((query: string) => {
  setSearchQuery(query)
}, [])

// PASS: React.memo for pure components
export const ItemCard = React.memo<ItemCardProps>(({ item }) => {
  return (
    <div className="item-card">
      <h3>{item.name}</h3>
      <p>{item.description}</p>
    </div>
  )
})
```

## コード分割と遅延読み込み

重いコンポーネントを `lazy` + `Suspense` で動的読み込みし、初期バンドルを小さく保つ。

```typescript
import { lazy, Suspense } from 'react'

// PASS: Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart'))
const ThreeJsBackground = lazy(() => import('./ThreeJsBackground'))

export function Dashboard() {
  return (
    <div>
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyChart data={data} />
      </Suspense>

      <Suspense fallback={null}>
        <ThreeJsBackground />
      </Suspense>
    </div>
  )
}
```

## 長大リストの仮想化

数百〜数千件以上のリストはスクロール領域内の可視行のみ描画する。`@tanstack/react-virtual` などの仮想化ライブラリが定番。

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

export function VirtualItemList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,  // Estimated row height
    overscan: 5  // Extra items to render
  })

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <ItemCard item={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```
