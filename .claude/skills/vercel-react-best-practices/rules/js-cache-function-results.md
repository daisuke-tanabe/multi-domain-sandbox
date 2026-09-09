---
title: Cache Repeated Function Calls
impact: MEDIUM
impactDescription: avoid redundant computation
tags: javascript, cache, memoization, performance
---

## Cache Repeated Function Calls

レンダリング中に同じ入力で同じ関数が繰り返し呼ばれる場合は、モジュールレベルの Map を使って結果をキャッシュする。

Incorrect (重複した計算):

```typescript
function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div>
      {projects.map(project => {
        // 同じプロジェクト名に対して slugify() が 100 回以上呼ばれる
        const slug = slugify(project.name)
        
        return <ProjectCard key={project.id} slug={slug} />
      })}
    </div>
  )
}
```

Correct (結果をキャッシュする):

```typescript
// モジュールレベルのキャッシュ
const slugifyCache = new Map<string, string>()

function cachedSlugify(text: string): string {
  if (slugifyCache.has(text)) {
    return slugifyCache.get(text)!
  }
  const result = slugify(text)
  slugifyCache.set(text, result)
  return result
}

function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div>
      {projects.map(project => {
        // ユニークなプロジェクト名ごとに 1 回だけ計算する
        const slug = cachedSlugify(project.name)
        
        return <ProjectCard key={project.id} slug={slug} />
      })}
    </div>
  )
}
```

単一値を返す関数向けのシンプルなパターン:

```typescript
let isLoggedInCache: boolean | null = null

function isLoggedIn(): boolean {
  if (isLoggedInCache !== null) {
    return isLoggedInCache
  }
  
  isLoggedInCache = document.cookie.includes('auth=')
  return isLoggedInCache
}

// 認証状態が変わったらキャッシュをクリア
function onAuthChange() {
  isLoggedInCache = null
}
```

hook ではなく Map を使うことで、ユーティリティやイベントハンドラなど React コンポーネント以外でも動作する。

Reference: [How we made the Vercel Dashboard twice as fast](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)
