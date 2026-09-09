---
title: Avoid Shared Module State for Request Data
impact: HIGH
impactDescription: prevents concurrency bugs and request data leaks
tags: server, rsc, ssr, concurrency, security, state
---

## Avoid Shared Module State for Request Data

React Server Components や SSR 中にレンダリングされる client コンポーネントでは、リクエストスコープのデータを共有する目的で、書き換え可能なモジュールレベル変数を使わない。サーバーのレンダリングは同一プロセス上で並行して走り得る。あるレンダーが共有モジュール状態に書き込み、別のレンダーがそれを読むと、競合状態、リクエスト間の汚染、別のユーザーのデータが他のユーザーのレスポンスに混入するセキュリティバグが発生する。

サーバー側のモジュールスコープは、リクエストローカルではなくプロセス全体で共有されたメモリと捉える。

Incorrect (リクエストデータが並行レンダー間で漏れる):

```tsx
let currentUser: User | null = null

export default async function Page() {
  currentUser = await auth()
  return <Dashboard />
}

async function Dashboard() {
  return <div>{currentUser?.name}</div>
}
```

リクエストが 2 つ重なると、リクエスト A が `currentUser` をセットし、リクエスト B が上書きして、リクエスト A が `Dashboard` のレンダリングを終える前に値が変わってしまう。

Correct (リクエストデータをレンダーツリー内に閉じ込める):

```tsx
export default async function Page() {
  const user = await auth()
  return <Dashboard user={user} />
}

function Dashboard({ user }: { user: User | null }) {
  return <div>{user?.name}</div>
}
```

安全な例外:

- モジュールスコープに 1 回だけ読み込まれたイミュータブルな静的アセットや設定
- リクエストをまたいで再利用する目的で意図的に設計され、適切に key 付けされた共有キャッシュ
- リクエスト固有・ユーザー固有の書き換え可能データを持たないプロセス全体のシングルトン

静的アセットや設定については [Hoist Static I/O to Module Level](./server-hoist-static-io.md) を参照。
