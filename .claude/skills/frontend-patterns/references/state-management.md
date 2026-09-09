# 状態管理（Context + Reducer）

複雑な共有状態は `useReducer` + `Context` で集約する。複数の `useState` が散在し、それらが互いに依存しはじめたら統合のサイン。

```typescript
interface State {
  items: Item[]
  selectedItem: Item | null
  loading: boolean
}

type Action =
  | { type: 'SET_ITEMS'; payload: Item[] }
  | { type: 'SELECT_ITEM'; payload: Item }
  | { type: 'SET_LOADING'; payload: boolean }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_ITEMS':
      return { ...state, items: action.payload }
    case 'SELECT_ITEM':
      return { ...state, selectedItem: action.payload }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    default:
      return state
  }
}

const ItemContext = createContext<{
  state: State
  dispatch: Dispatch<Action>
} | undefined>(undefined)

export function ItemProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    items: [],
    selectedItem: null,
    loading: false
  })

  return (
    <ItemContext.Provider value={{ state, dispatch }}>
      {children}
    </ItemContext.Provider>
  )
}

export function useItems() {
  const context = useContext(ItemContext)
  if (!context) throw new Error('useItems must be used within ItemProvider')
  return context
}
```

## いつ外部ライブラリ（Zustand / Redux 等）に切り替えるか

- Context の更新が頻繁で再レンダリングコストが見えてきたとき
- セレクタによる部分購読が欲しくなったとき
- DevTools / 永続化 / ミドルウェアが必要になったとき
