---
name: test-environments
description: jsdom や happy-dom などのブラウザ API 向け環境を設定する
---

# テスト環境

## 利用可能な環境

- `node` (デフォルト) - Node.js 環境
- `jsdom` - DOM API を備えたブラウザライク環境
- `happy-dom` - jsdom より高速な代替
- `edge-runtime` - Vercel Edge Runtime

## 設定

```ts
// vitest.config.ts
defineConfig({
  test: {
    environment: 'jsdom',
    
    // 環境固有のオプション
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
  },
})
```

## 環境パッケージのインストール

```bash
# jsdom
npm i -D jsdom

# happy-dom (高速・API は少なめ)
npm i -D happy-dom
```

## ファイル単位の環境

ファイル先頭にマジックコメントを記述する:

```ts
// @vitest-environment jsdom

import { expect, test } from 'vitest'

test('DOM test', () => {
  const div = document.createElement('div')
  expect(div).toBeInstanceOf(HTMLDivElement)
})
```

## jsdom 環境

ブラウザ環境を完全にシミュレートする:

```ts
// @vitest-environment jsdom

test('DOM manipulation', () => {
  document.body.innerHTML = '<div id="app"></div>'
  
  const app = document.getElementById('app')
  app.textContent = 'Hello'
  
  expect(app.textContent).toBe('Hello')
})

test('window APIs', () => {
  expect(window.location.href).toBeDefined()
  expect(localStorage).toBeDefined()
})
```

### jsdom のオプション

```ts
defineConfig({
  test: {
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000',
        html: '<!DOCTYPE html><html><body></body></html>',
        userAgent: 'custom-agent',
        resources: 'usable',
      },
    },
  },
})
```

## happy-dom 環境

高速だが API は少ない:

```ts
// @vitest-environment happy-dom

test('basic DOM', () => {
  const el = document.createElement('div')
  el.className = 'test'
  expect(el.className).toBe('test')
})
```

## プロジェクトごとに複数の環境

異なる環境ごとに project を使う:

```ts
defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'dom',
          include: ['tests/dom/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
})
```

## カスタム環境

カスタム環境パッケージを作成する:

```ts
// vitest-environment-custom/index.ts
import type { Environment } from 'vitest/runtime'

export default <Environment>{
  name: 'custom',
  viteEnvironment: 'ssr', // または 'client'
  
  setup() {
    // グローバル状態をセットアップ
    globalThis.myGlobal = 'value'
    
    return {
      teardown() {
        delete globalThis.myGlobal
      },
    }
  },
}
```

使い方:

```ts
defineConfig({
  test: {
    environment: 'custom',
  },
})
```

## VM 付きの環境

完全な隔離向け:

```ts
export default <Environment>{
  name: 'isolated',
  viteEnvironment: 'ssr',
  
  async setupVM() {
    const vm = await import('node:vm')
    const context = vm.createContext()
    
    return {
      getVmContext() {
        return context
      },
      teardown() {},
    }
  },
  
  setup() {
    return { teardown() {} }
  },
}
```

## Browser Mode (環境とは別)

実ブラウザでのテストには Vitest Browser Mode を使う。v4 では provider は文字列ではなくオブジェクトになり、context は `vitest/browser` から import する:

```ts
import { playwright } from '@vitest/browser-playwright'

defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright({ launchOptions: { slowMo: 100 } }),
      instances: [{ browser: 'chromium' }], // 'firefox' や 'webkit' も可
    },
  },
})
```

```ts
import { page } from 'vitest/browser' // v4: 以前は '@vitest/browser/context'
```

> v5: `window.innerWidth` のような DOM 環境のグローバルへの代入は、下層の jsdom / happy-dom 実装に伝播するようになった。locator もデフォルトで exact / strict になった。

## CSS とアセット

jsdom / happy-dom では CSS の扱いを設定できる:

```ts
defineConfig({
  test: {
    css: true, // CSS を処理する
    
    // オプション付き
    css: {
      include: /\.module\.css$/,
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
})
```

## 外部依存の修正

外部依存が CSS / アセットエラーで失敗する場合:

```ts
defineConfig({
  test: {
    server: {
      deps: {
        inline: ['problematic-package'],
      },
    },
  },
})
```

## 要点

- デフォルトは `node` - ブラウザ API は無い
- 完全なブラウザシミュレーションには `jsdom` を使う
- 基本的な DOM だけで高速にテストしたい場合は `happy-dom` を使う
- ファイル単位の環境指定は `// @vitest-environment` コメントで行う
- 複数の環境設定には project を使う
- Browser Mode は環境ではなく実ブラウザテスト用

<!-- 
Source references:
- https://vitest.dev/guide/environment.html
-->
