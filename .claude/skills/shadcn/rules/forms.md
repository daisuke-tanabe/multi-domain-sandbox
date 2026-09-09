# Forms と Inputs

## 目次

- フォームは `FieldGroup` + `Field` を使う
- `InputGroup` は `InputGroupInput`/`InputGroupTextarea` が必須
- 入力内のボタンは `InputGroup` + `InputGroupAddon` を使う
- 2〜7 個の選択肢は `ToggleGroup` を使う
- 関連するフィールドのグループ化には `FieldSet` + `FieldLegend`
- フィールドのバリデーションと無効状態

---

## フォームは FieldGroup + Field を使う

常に `FieldGroup` + `Field` を使う。生の `div` + `space-y-*` は使わない。

```tsx
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" type="email" />
  </Field>
  <Field>
    <FieldLabel htmlFor="password">Password</FieldLabel>
    <Input id="password" type="password" />
  </Field>
</FieldGroup>
```

設定ページでは `Field orientation="horizontal"` を使う。視覚的に隠したラベルには `FieldLabel className="sr-only"` を使う。

フォームコントロールの選び方:

- シンプルなテキスト入力 → `Input`
- 既定の選択肢を持つドロップダウン → `Select`
- 検索可能なドロップダウン → `Combobox`
- ネイティブ HTML select (JS なし) → `native-select`
- 真偽のトグル → `Switch` (設定向け) または `Checkbox` (フォーム向け)
- 少数選択肢からの単一選択 → `RadioGroup`
- 2〜5 個の選択肢のトグル → `ToggleGroup` + `ToggleGroupItem`
- OTP/認証コード → `InputOTP`
- 複数行テキスト → `Textarea`

---

## InputGroup は InputGroupInput/InputGroupTextarea が必須

`InputGroup` の中で生の `Input` や `Textarea` を使わない。

Incorrect:

```tsx
<InputGroup>
  <Input placeholder="Search..." />
</InputGroup>
```

Correct:

```tsx
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"

<InputGroup>
  <InputGroupInput placeholder="Search..." />
</InputGroup>
```

---

## 入力内のボタンは InputGroup + InputGroupAddon を使う

`Button` を `Input` の中や隣に独自に配置しない。

Incorrect:

```tsx
<div className="relative">
  <Input placeholder="Search..." className="pr-10" />
  <Button className="absolute right-0 top-0" size="icon">
    <SearchIcon />
  </Button>
</div>
```

Correct:

```tsx
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group"

<InputGroup>
  <InputGroupInput placeholder="Search..." />
  <InputGroupAddon>
    <Button size="icon">
      <SearchIcon data-icon="inline-start" />
    </Button>
  </InputGroupAddon>
</InputGroup>
```

---

## 2〜7 個の選択肢は ToggleGroup を使う

`Button` コンポーネントを手でループしてアクティブ状態を管理しない。

Incorrect:

```tsx
const [selected, setSelected] = useState("daily")

<div className="flex gap-2">
  {["daily", "weekly", "monthly"].map((option) => (
    <Button
      key={option}
      variant={selected === option ? "default" : "outline"}
      onClick={() => setSelected(option)}
    >
      {option}
    </Button>
  ))}
</div>
```

Correct:

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

<ToggleGroup spacing={2}>
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
  <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
  <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
</ToggleGroup>
```

ラベル付きの toggle group には `Field` と組み合わせる。

```tsx
<Field orientation="horizontal">
  <FieldTitle id="theme-label">Theme</FieldTitle>
  <ToggleGroup aria-labelledby="theme-label" spacing={2}>
    <ToggleGroupItem value="light">Light</ToggleGroupItem>
    <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
    <ToggleGroupItem value="system">System</ToggleGroupItem>
  </ToggleGroup>
</Field>
```

> 注: `defaultValue` と `type`/`multiple` の props は base と radix で異なる。[base-vs-radix.md](./base-vs-radix.md#togglegroup) を参照。

---

## 関連するフィールドのグループ化には FieldSet + FieldLegend

関連するチェックボックス・ラジオ・スイッチをまとめる場合は `FieldSet` + `FieldLegend` を使う。見出し付きの `div` は使わない。

```tsx
<FieldSet>
  <FieldLegend variant="label">Preferences</FieldLegend>
  <FieldDescription>Select all that apply.</FieldDescription>
  <FieldGroup className="gap-3">
    <Field orientation="horizontal">
      <Checkbox id="dark" />
      <FieldLabel htmlFor="dark" className="font-normal">Dark mode</FieldLabel>
    </Field>
  </FieldGroup>
</FieldSet>
```

---

## フィールドのバリデーションと無効状態

両方の属性が必要 — `data-invalid`/`data-disabled` はフィールド (ラベル、説明) のスタイリング、`aria-invalid`/`disabled` はコントロールのスタイリングに使う。

```tsx
// Invalid.
<Field data-invalid>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" aria-invalid />
  <FieldDescription>Invalid email address.</FieldDescription>
</Field>

// Disabled.
<Field data-disabled>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" disabled />
</Field>
```

すべてのコントロールに適用できる: `Input`、`Textarea`、`Select`、`Checkbox`、`RadioGroupItem`、`Switch`、`Slider`、`NativeSelect`、`InputOTP`。
