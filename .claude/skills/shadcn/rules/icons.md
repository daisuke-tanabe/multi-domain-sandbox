# Icons

import には常にプロジェクトで設定された `iconLibrary` を使う。 プロジェクトコンテキストの `iconLibrary` フィールドを確認する: `lucide` → `lucide-react`、`tabler` → `@tabler/icons-react` など。`lucide-react` を勝手に前提にしない。

---

## Button 内のアイコンは data-icon 属性を使う

アイコンに `data-icon="inline-start"` (前置) または `data-icon="inline-end"` (後置) を付ける。アイコンにはサイズクラスを付けない。

Incorrect:

```tsx
<Button>
  <SearchIcon className="mr-2 size-4" />
  Search
</Button>
```

Correct:

```tsx
<Button>
  <SearchIcon data-icon="inline-start"/>
  Search
</Button>

<Button>
  Next
  <ArrowRightIcon data-icon="inline-end"/>
</Button>
```

---

## コンポーネント内のアイコンにサイズクラスを付けない

コンポーネントは CSS でアイコンのサイズを管理する。`Button`、`DropdownMenuItem`、`Alert`、`Sidebar*` その他の shadcn コンポーネント内のアイコンに `size-4`、`w-4 h-4`、その他のサイズクラスを付けない。ユーザーがカスタムサイズを明示的に求めた場合を除く。

Incorrect:

```tsx
<Button>
  <SearchIcon className="size-4" data-icon="inline-start" />
  Search
</Button>

<DropdownMenuItem>
  <SettingsIcon className="mr-2 size-4" />
  Settings
</DropdownMenuItem>
```

Correct:

```tsx
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

<DropdownMenuItem>
  <SettingsIcon />
  Settings
</DropdownMenuItem>
```

---

## アイコンは文字列キーではなくコンポーネントオブジェクトとして渡す

ルックアップマップへの文字列キーではなく `icon={CheckIcon}` を使う。

Incorrect:

```tsx
const iconMap = {
  check: CheckIcon,
  alert: AlertIcon,
}

function StatusBadge({ icon }: { icon: string }) {
  const Icon = iconMap[icon]
  return <Icon />
}

<StatusBadge icon="check" />
```

Correct:

```tsx
// プロジェクトで設定された iconLibrary から import する (例: lucide-react、@tabler/icons-react)。
import { CheckIcon } from "lucide-react"

function StatusBadge({ icon: Icon }: { icon: React.ComponentType }) {
  return <Icon />
}

<StatusBadge icon={CheckIcon} />
```
