# Base と Radix の違い

`base` と `radix` の API の差分。`npx shadcn@latest info` の `base` フィールドを確認する。

## 目次

- コンポジション: asChild と render
- ボタン/トリガーを非ボタン要素として使う
- Select (items prop、placeholder、配置、multiple、オブジェクト値)
- ToggleGroup (type と multiple)
- Slider (スカラー値と配列)
- Accordion (type と defaultValue)

---

## コンポジション: asChild (radix) と render (base)

Radix はデフォルト要素を置き換えるのに `asChild` を使う。Base は `render` を使う。トリガーを余計な要素で包まない。

Incorrect:

```tsx
<DialogTrigger>
  <div>
    <Button>Open</Button>
  </div>
</DialogTrigger>
```

Correct (radix):

```tsx
<DialogTrigger asChild>
  <Button>Open</Button>
</DialogTrigger>
```

Correct (base):

```tsx
<DialogTrigger render={<Button />}>Open</DialogTrigger>
```

これはすべてのトリガー/クローズ系コンポーネントに当てはまる: `DialogTrigger`、`SheetTrigger`、`AlertDialogTrigger`、`DropdownMenuTrigger`、`PopoverTrigger`、`TooltipTrigger`、`CollapsibleTrigger`、`DialogClose`、`SheetClose`、`NavigationMenuLink`、`BreadcrumbLink`、`SidebarMenuButton`、`Badge`、`Item`。

---

## ボタン/トリガーを非ボタン要素として使う (base のみ)

`render` で要素を非ボタン (`<a>`、`<span>`) に変える場合は `nativeButton={false}` を追加する。

Incorrect (base): `nativeButton={false}` の付け忘れ。

```tsx
<Button render={<a href="/docs" />}>Read the docs</Button>
```

Correct (base):

```tsx
<Button render={<a href="/docs" />} nativeButton={false}>
  Read the docs
</Button>
```

Correct (radix):

```tsx
<Button asChild>
  <a href="/docs">Read the docs</a>
</Button>
```

`render` が `Button` 以外のトリガーでも同じ。

```tsx
// base.
<PopoverTrigger render={<InputGroupAddon />} nativeButton={false}>
  Pick date
</PopoverTrigger>
```

---

## Select

items prop (base のみ)。 Base はルートに `items` prop が必須。Radix はインライン JSX のみを使う。

Incorrect (base):

```tsx
<Select>
  <SelectTrigger><SelectValue placeholder="Select a fruit" /></SelectTrigger>
</Select>
```

Correct (base):

```tsx
const items = [
  { label: "Select a fruit", value: null },
  { label: "Apple", value: "apple" },
  { label: "Banana", value: "banana" },
]

<Select items={items}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      {items.map((item) => (
        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
      ))}
    </SelectGroup>
  </SelectContent>
</Select>
```

Correct (radix):

```tsx
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select a fruit" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectItem value="apple">Apple</SelectItem>
      <SelectItem value="banana">Banana</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

Placeholder。 Base は items 配列の `{ value: null }` アイテムで指定する。Radix は `<SelectValue placeholder="...">` を使う。

コンテンツの配置。 Base は `alignItemWithTrigger` を使う。Radix は `position` を使う。

```tsx
// base.
<SelectContent alignItemWithTrigger={false} side="bottom">

// radix.
<SelectContent position="popper">
```

---

## Select — 複数選択とオブジェクト値 (base のみ)

Base は `multiple`、`SelectValue` の render-function children、`itemToStringValue` によるオブジェクト値をサポートする。Radix は単一選択かつ文字列値のみ。

Correct (base — 複数選択):

```tsx
<Select items={items} multiple defaultValue={[]}>
  <SelectTrigger>
    <SelectValue>
      {(value: string[]) => value.length === 0 ? "Select fruits" : `${value.length} selected`}
    </SelectValue>
  </SelectTrigger>
  ...
</Select>
```

Correct (base — オブジェクト値):

```tsx
<Select defaultValue={plans[0]} itemToStringValue={(plan) => plan.name}>
  <SelectTrigger>
    <SelectValue>{(value) => value.name}</SelectValue>
  </SelectTrigger>
  ...
</Select>
```

---

## ToggleGroup

Base は `multiple` の真偽値 prop を使う。Radix は `type="single"` または `type="multiple"` を使う。

Incorrect (base):

```tsx
<ToggleGroup type="single" defaultValue="daily">
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
</ToggleGroup>
```

Correct (base):

```tsx
// 単一選択 (prop 不要)、defaultValue は常に配列。
<ToggleGroup defaultValue={["daily"]} spacing={2}>
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
  <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
</ToggleGroup>

// 複数選択。
<ToggleGroup multiple>
  <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
  <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
</ToggleGroup>
```

Correct (radix):

```tsx
// 単一選択。defaultValue は文字列。
<ToggleGroup type="single" defaultValue="daily" spacing={2}>
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
  <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
</ToggleGroup>

// 複数選択。
<ToggleGroup type="multiple">
  <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
  <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
</ToggleGroup>
```

単一値の制御:

```tsx
// base — 配列で wrap/unwrap する。
const [value, setValue] = React.useState("normal")
<ToggleGroup value={[value]} onValueChange={(v) => setValue(v[0])}>

// radix — 単純な文字列。
const [value, setValue] = React.useState("normal")
<ToggleGroup type="single" value={value} onValueChange={setValue}>
```

---

## Slider

Base は単一つまみの場合に素のナンバーを受け付ける。Radix は常に配列が必要。

Incorrect (base):

```tsx
<Slider defaultValue={[50]} max={100} step={1} />
```

Correct (base):

```tsx
<Slider defaultValue={50} max={100} step={1} />
```

Correct (radix):

```tsx
<Slider defaultValue={[50]} max={100} step={1} />
```

レンジスライダーはどちらも配列を使う。base の制御モードでは `onValueChange` にキャストが必要になる場合がある。

```tsx
// base.
const [value, setValue] = React.useState([0.3, 0.7])
<Slider value={value} onValueChange={(v) => setValue(v as number[])} />

// radix.
const [value, setValue] = React.useState([0.3, 0.7])
<Slider value={value} onValueChange={setValue} />
```

---

## Accordion

Radix は `type="single"` か `type="multiple"` が必要で、`collapsible` をサポートする。`defaultValue` は文字列。Base は `type` prop を使わず、`multiple` の真偽値を使う。`defaultValue` は常に配列。

Incorrect (base):

```tsx
<Accordion type="single" collapsible defaultValue="item-1">
  <AccordionItem value="item-1">...</AccordionItem>
</Accordion>
```

Correct (base):

```tsx
<Accordion defaultValue={["item-1"]}>
  <AccordionItem value="item-1">...</AccordionItem>
</Accordion>

// 複数選択。
<Accordion multiple defaultValue={["item-1", "item-2"]}>
  <AccordionItem value="item-1">...</AccordionItem>
  <AccordionItem value="item-2">...</AccordionItem>
</Accordion>
```

Correct (radix):

```tsx
<Accordion type="single" collapsible defaultValue="item-1">
  <AccordionItem value="item-1">...</AccordionItem>
</Accordion>
```
