---

title: Extract Default Non-primitive Parameter Value from Memoized Component to Constant
impact: MEDIUM
impactDescription: restores memoization by using a constant for default value
tags: rerender, memo, optimization

---

## Extract Default Non-primitive Parameter Value from Memoized Component to Constant

memo 化されたコンポーネントが、配列・関数・オブジェクトのような非プリミティブのオプションパラメータにデフォルト値を持っている場合、そのパラメータを渡さずに呼び出すと memoization が壊れる。これは、毎レンダーで新しいインスタンスが生成され、`memo()` の厳密等価比較を通らないため。

これを解消するには、デフォルト値を定数に抽出する。

Incorrect (`onClick` は毎レンダーで異なる値になる):

```tsx
const UserAvatar = memo(function UserAvatar({ onClick = () => {} }: { onClick?: () => void }) {
  // ...
})

// オプションの onClick を渡さずに使う
<UserAvatar />
```

Correct (デフォルト値が安定する):

```tsx
const NOOP = () => {};

const UserAvatar = memo(function UserAvatar({ onClick = NOOP }: { onClick?: () => void }) {
  // ...
})

// オプションの onClick を渡さずに使う
<UserAvatar />
```
