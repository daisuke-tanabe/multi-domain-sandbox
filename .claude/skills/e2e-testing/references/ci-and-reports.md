# CI/CD 連携・レポート・クリティカルフロー

## CI/CD 連携（GitHub Actions 例）

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          BASE_URL: ${{ vars.STAGING_URL }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

ポイント:
- `if: always()` で失敗時もアーティファクトをアップロード
- `--with-deps` でブラウザの OS 依存関係を自動インストール
- `BASE_URL` は環境変数で切り替え

## テストレポートのテンプレート

```markdown
# E2E Test Report

**Date:** YYYY-MM-DD HH:MM
**Duration:** Xm Ys
**Status:** PASSING / FAILING

## Summary
- Total: X | Passed: Y (Z%) | Failed: A | Flaky: B | Skipped: C

## Failed Tests

### test-name
**File:** `tests/e2e/feature.spec.ts:45`
**Error:** Expected element to be visible
**Screenshot:** artifacts/failed.png
**Recommended Fix:** [description]

## Artifacts
- HTML Report: playwright-report/index.html
- Screenshots: artifacts/*.png
- Videos: artifacts/videos/*.webm
- Traces: artifacts/*.zip
```

## 外部統合のモック

ブラウザ拡張やウォレット等、外部 API に依存するフローは `addInitScript` でモックする。

```typescript
test('wallet connection', async ({ page, context }) => {
  // Mock provider injected before page scripts run
  await context.addInitScript(() => {
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method }) => {
        if (method === 'eth_requestAccounts')
          return ['0x1234567890123456789012345678901234567890']
        if (method === 'eth_chainId') return '0x1'
      }
    }
  })

  await page.goto('/')
  await page.locator('[data-testid="connect-wallet"]').click()
  await expect(page.locator('[data-testid="wallet-address"]')).toContainText('0x1234')
})
```

## クリティカルフロー（決済・取引等）のテスト

本番環境では実行しない、十分な timeout を取る、最終結果まで明示的に待つ。

```typescript
test('critical transaction flow', async ({ page }) => {
  // Skip on production — real money / side effects
  test.skip(process.env.NODE_ENV === 'production', 'Skip on production')

  await page.goto('/checkout/test-order')
  await page.locator('[data-testid="payment-method-card"]').click()
  await page.locator('[data-testid="amount"]').fill('10.00')

  // Verify preview before confirming
  const preview = page.locator('[data-testid="payment-preview"]')
  await expect(preview).toContainText('10.00')

  // Confirm and wait for backend confirmation
  await page.locator('[data-testid="confirm-payment"]').click()
  await page.waitForResponse(
    resp => resp.url().includes('/api/payment') && resp.status() === 200,
    { timeout: 30000 }
  )

  await expect(page.locator('[data-testid="payment-success"]')).toBeVisible()
})
```
