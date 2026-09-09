# テストパターン（ユニット / 統合 / E2E）

## ユニットテストパターン（Jest / Vitest）

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button Component', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click</Button>)

    fireEvent.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

## Bun ネイティブテストパターン（`bun:test`）

プロジェクトが Bun 組み込みランナーを使う場合は `bun:test` から import し、`bun run test` ではなく `bun test` で実行する。API は Jest 風で、`describe` / `it` / `expect` と大半のマッチャーはそのまま使える。

```typescript
import { describe, it, expect, mock } from 'bun:test'
import { searchMarkets } from './search'

describe('searchMarkets', () => {
  it('returns an empty list for an empty query', async () => {
    expect(await searchMarkets('')).toEqual([])
  })

  it('sorts results by similarity score', async () => {
    const results = await searchMarkets('election')
    expect(results).toEqual([...results].sort((a, b) => b.score - a.score))
  })
})
```

```bash
bun test              # 1 回実行する (RED/GREEN ゲート)
bun test --watch      # 開発中の watch モード
bun test --coverage   # カバレッジレポート
```

- モジュールのモックは `jest.mock(...)` ではなく `bun:test` の `mock.module(...)` / `mock(...)` を使う
- カバレッジしきい値は Jest の `coverageThresholds` ではなく `bunfig.toml` の `[test]` で設定する

## API 統合テストパターン

```typescript
import { NextRequest } from 'next/server'
import { GET } from './route'

describe('GET /api/items', () => {
  it('returns items successfully', async () => {
    const request = new NextRequest('http://localhost/api/items')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
  })

  it('validates query parameters', async () => {
    const request = new NextRequest('http://localhost/api/items?limit=invalid')
    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('handles database errors gracefully', async () => {
    // Mock database failure
    const request = new NextRequest('http://localhost/api/items')
    // Test error handling
  })
})
```

## E2E テストパターン（Playwright）

```typescript
import { test, expect } from '@playwright/test'

test('user can search and filter items', async ({ page }) => {
  // Navigate to listing page
  await page.goto('/')
  await page.click('a[href="/items"]')

  // Verify page loaded
  await expect(page.locator('h1')).toContainText('Items')

  // Search
  await page.fill('input[placeholder="Search items"]', 'keyword')

  // Wait for debounce and results
  await page.waitForTimeout(600)

  // Verify search results displayed
  const results = page.locator('[data-testid="item-card"]')
  await expect(results).toHaveCount(5, { timeout: 5000 })

  // Verify results contain search term
  const firstResult = results.first()
  await expect(firstResult).toContainText('keyword', { ignoreCase: true })

  // Filter by status
  await page.click('button:has-text("Active")')

  // Verify filtered results
  await expect(results).toHaveCount(3)
})

test('user can create a new item', async ({ page }) => {
  await page.goto('/dashboard')

  await page.fill('input[name="name"]', 'Test Item')
  await page.fill('textarea[name="description"]', 'Test description')
  await page.fill('input[name="endDate"]', '2025-12-31')

  await page.click('button[type="submit"]')

  await expect(page.locator('text=Item created successfully')).toBeVisible()
  await expect(page).toHaveURL(/\/items\/test-item/)
})
```

## テストファイルの構成

```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx          # Unit tests
│   │   └── Button.stories.tsx       # Storybook
│   └── ItemCard/
│       ├── ItemCard.tsx
│       └── ItemCard.test.tsx
├── app/
│   └── api/
│       └── items/
│           ├── route.ts
│           └── route.test.ts         # Integration tests
└── e2e/
    ├── items.spec.ts                 # E2E tests
    ├── checkout.spec.ts
    └── auth.spec.ts
```
