# テストテンプレート: instant() ガード

参照: [`@next/playwright` `instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests)。

ガードするナビゲーション種別ごとにテストを 1 本出荷する。`instant()` の下で、遷移先の static shell が現れることをアサートする。`instant()` は dynamic data をゲートするので、正しく instant なルートはロックの下でも shell をコミットし、ブロックするルートはコミットしない。`instant()` は定規でありストップウォッチではない。カスタムタイムアウトやタイミングの競争を足さない。`reference/red-test-robustness.md` を参照。マーカーが正しいものであるか、つまりテストユーザーにレンダリングされ、フラグでゲートされておらず、リダイレクトで逸れず、当て推量でもないことは、後述のロックなし baseline 足場を使って作成時に確立する。フェーズ B と C-gate がそれにあたる。出荷テストにアサーションを足して確立するのではない。

角括弧の識別子 (`<b>`、`<Trigger>`) と `../helpers` の import はプレースホルダである。実行前にプロジェクトの e2e 認証ヘルパー、URL ヘルパー、実際の testid とトリガーに置き換える。

## Soft navigation (client-side navigation)

実際の `<Link>` クリックで駆動する。コミットされる shell は遷移先の prefetch 済み App Shell である。ロックの下では router 自身が route prefetch を開始して待つので、手動のウォームアップは不要である。shell が断続的に現れないなら、本物のブロッカーかマーカーのバグとして扱う。C-gate を参照。ウォーミングの競争として扱わない。wait や hover を足さない。

```ts
import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'
// Use the auth/setup helpers your e2e suite already has. Run as the test user
// (defined in SKILL.md phase B).
import { logIntoTestAccount, testUrl } from '../helpers'

// A SYNC element of the destination's static shell (header, action button,
// column header), not data that streams in, and one that renders for the
// test user (not gated by a flag, plan, role, or empty state). Prefer a
// data-testid on a known static node over a guessed role/name.
const SHELL_MARKER = '[data-testid="<b>-shell-marker"]'

test.describe('instant nav: A -> B', () => {
  test.beforeEach(async ({ page, browser }) => {
    await logIntoTestAccount(page, browser)
  })

  test('B shell commits under instant()', async ({ page }) => {
    await page.goto(testUrl('/'))
    const trigger = page.getByRole('link', { name: '<Trigger>', exact: true })
    await expect(trigger).toBeVisible({ timeout: 20000 })

    await instant(page, async () => {
      await trigger.click()
      // static shell asserted under the lock; no timeout
      await expect(page.locator(SHELL_MARKER)).toBeVisible()
    })
  })
})
```

トリガーのセレクタも `SHELL_MARKER` と同じルールに従う。当て推量のアクセシブルネームより、実際の `<Link>` に付けた `data-testid` を優先する。`page.getByTestId('<trigger>-link')` の形である。`getByRole({ name })` は簡潔さのために示しただけで、マーカーと同様、トリガーもテストユーザーに対して確実に解決しなければならない。

## Initial load (hard navigation)

`instant()` の中で `baseURL` オプション付きの `page.goto()` を駆動する。配信される document はルートの prerender 済み static shell である。`baseURL` が必須なのは、`instant()` 実行時の `page` がまだ `about:blank` だからだ。`resolveURL` が `page.url()` にフォールバックするのは `baseURL` が渡されなかった場合だけである。セッションは `page` をナビゲートせずに確立する。`storageState` を注入するか、別の context/page でログインする。`page` 自身をナビゲートするログインヘルパーは別の理由で計測を無効化する。そのナビゲーションは `instant()` がロックを取得する前に完了するため、計測されずに実行される。いずれにせよセッションは事前に確立されていなければならない。さもないと認証付きルートはログインへリダイレクトし、RED は偽物になる。

プロジェクトのログインヘルパーが `page` をナビゲートするものしかない場合、agent はここで storageState か別 context の経路、つまり `page.goto` を呼ばないセッション注入を使わなければならない:

```ts
test.describe('instant initial load: B', () => {
  test.beforeEach(async ({ page }) => {
    await injectTestUserSession(page) // storageState only; must NOT call page.goto
  })

  test('B shell is served', async ({ page }) => {
    const url = testUrl('/<b>')
    await instant(
      page,
      async () => {
        await page.goto(url)
        await expect(page.locator(SHELL_MARKER)).toBeVisible()
      },
      { baseURL: new URL(url).origin }
    )
  })
})
```

## Self-validating 変種。遅延コンテンツを持つルートに推奨

遅延コンテンツがロックの下でゲートされ、解放後にストリームインすることも併せてアサートする。これで空虚な pass が不可能になる。ロックが効かなかった場合、つまりビルドに testing API がない場合はコンテンツが既に存在し、`toHaveCount(0)` が失敗する。`reference/red-test-robustness.md` を参照。

`SHELL_MARKER` は shell のノード、`[data-testid="<b>-content"]` はそれが守る遅延データである。

```ts
// soft navigation
await instant(page, async () => {
  await trigger.click()
  await expect(page.locator(SHELL_MARKER)).toBeVisible() // shell present
  await expect(page.getByTestId('<b>-content')).toHaveCount(0) // deferred data gated
})
await expect(page.getByTestId('<b>-content')).toBeVisible() // streams after release
```

ゲート側の 2 つのアサーション、つまり shell の可視と遅延コンテンツの `toHaveCount(0)` は、initial-load の `page.goto()` 形式にも適用できる。cookie は両ナビゲーション種別で同じように遅延コンテンツをゲートする。soft navigation ではクライアントのロックが dynamic-data の書き込みをゲートし、initial load ではサーバーが document リクエストの cookie を尊重して dynamic data をサスペンドする。cookie はナビゲーション前に `addCookies()` で設定し、`baseURL` でスコープする。ルートが以前レンダリング済みかキャッシュ済みかには依存しない。したがって initial-load の `toHaveCount(0)` ゲート側は soft-nav のものと同等に有効で、新しい browser context もキャッシュバスティングのクエリパラメータも要らない。

解放後のアサーション、つまり `instant()` ブロックの後の `getByTestId('<b>-content').toBeVisible()` は soft-nav 専用である。initial load では document はロックの下で既に出力済みなので、解放後に何もストリームインしない。initial-load テストではそのアサーションを外すか、先に `page.reload()` してロックなしの document を取得する。メカニズムは `reference/red-test-robustness.md` にある。

## Baseline の足場。出荷しない

最適化の前に、ロックなしのチェック、つまり `instant()` なしで対象の存在を確認する。「instant ではない」と「このユーザーまたは環境にマーカーが存在しない」を切り分けるためだ。テストユーザーとして実行する。rig の DRIFT リストとの不一致こそ C-gate が捕まえるものである。`reference/red-test-robustness.md` を参照。マーカーが実在し到達可能であることを確認したら、PR の前に足場を削除する。

baseline は出荷するテストと同じナビゲーション種別を写さなければならない。soft-nav の shell をガードするなら `<Link>` クリックを駆動し、initial-load の shell をガードするなら `page.goto()` を駆動する。2 つの shell は異なりうる。`reference/real-app-patterns.md` を参照。クリック駆動の baseline を `goto` の出荷テストに対して実行すると、`goto` 経路では決して表示されないマーカーを確認してしまい、C-gate が防ごうとしている偽の RED をまさに生む。

```ts
// soft-nav baseline: mirror the soft-nav instant() test
test('dev-only: navigating to <b> renders its shell (no lock)', async ({
  page,
}) => {
  await page.goto(testUrl('/'))
  const trigger = page.getByRole('link', { name: '<Trigger>', exact: true })
  await expect(trigger).toBeVisible({ timeout: 20000 })
  await trigger.click()
  await expect(page).toHaveURL(/\/<b>(\?|$)/) // confirm the real destination (no redirect away)
  await expect(page.locator(SHELL_MARKER)).toBeVisible({ timeout: 15000 })
})
```

```ts
// initial-load baseline: mirror the initial-load instant() test (session pre-established)
test('dev-only: <b> shell is served (no lock)', async ({ page }) => {
  await page.goto(testUrl('/<b>'))
  await expect(page.locator(SHELL_MARKER)).toBeVisible({ timeout: 15000 })
})
```

注意:

- `SHELL_MARKER` には遷移先の static shell の sync な要素を選ぶ。ストリームされるデータは決して選ばない。当て推量の role/name ではなく、既知の static ノードに付けた `data-testid` を使う。
- 出荷するアサーションにカスタムタイムアウト、`painted` の boolean、`isVisible({ timeout })` を入れない。retry や hover によるウォーミングも足さない。`reference/red-test-robustness.md` を参照。
