# フレーキーテストへの対処

## 隔離（Quarantine）

修正までの間、フレーキーテストを隔離する。`fixme` で「失敗を許容するが追跡対象」とマークし、`skip` で完全にスキップする。Issue 番号を必ず付ける。

```typescript
test('flaky: complex search', async ({ page }) => {
  test.fixme(true, 'Flaky - Issue #123')
  // test code...
})

test('conditional skip', async ({ page }) => {
  test.skip(process.env.CI, 'Flaky in CI - Issue #123')
  // test code...
})
```

## フレーキー性の特定

```bash
# 同じテストを 10 回繰り返してパス率を確認
npx playwright test tests/search.spec.ts --repeat-each=10

# リトライ込みで判定
npx playwright test tests/search.spec.ts --retries=3
```

## よくある原因と修正

### 競合条件

操作前に要素が描画されている保証がない。`page.click` ではなく `locator.click` を使うと auto-wait が効く。

```typescript
// Bad: assumes element is ready
await page.click('[data-testid="button"]')

// Good: auto-wait locator
await page.locator('[data-testid="button"]').click()
```

### ネットワークタイミング

`waitForTimeout` は実行環境のばらつきで失敗する。期待する API レスポンスや状態を明示的に待つ。

```typescript
// Bad: arbitrary timeout
await page.waitForTimeout(5000)

// Good: wait for specific condition
await page.waitForResponse(resp => resp.url().includes('/api/data'))
```

### アニメーションタイミング

アニメーション中の要素はクリック領域が動いてフレーキー化する。`waitFor({ state: 'visible' })` と `networkidle` を組み合わせて静止状態を待つ。

```typescript
// Bad: click during animation
await page.click('[data-testid="menu-item"]')

// Good: wait for stability
await page.locator('[data-testid="menu-item"]').waitFor({ state: 'visible' })
await page.waitForLoadState('networkidle')
await page.locator('[data-testid="menu-item"]').click()
```

## 体系的な対処手順

1. 失敗を 隔離（fixme / skip）して main を緑に保つ
2. 再現性確認（`--repeat-each`）でフレーキー率を計測
3. 原因分類（タイミング / セレクタ / 外部依存）
4. 修正 → 隔離解除
5. 修正不能なら削除を検討（カバレッジが薄いなら無くてよい）
