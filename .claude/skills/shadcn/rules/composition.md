# コンポーネントのコンポジション

## 目次

- Item は必ず対応する Group コンポーネントの中に置く
- コールアウトには Alert を使う
- 空状態には Empty コンポーネントを使う
- トースト通知はプロジェクトの base に従う
- オーバーレイ系コンポーネントの選び方
- Dialog、Sheet、Drawer には必ず Title が必要
- Card の構造
- Button に isPending や isLoading の prop はない
- TabsTrigger は TabsList の中に置く
- Avatar には必ず AvatarFallback が必要
- 生の hr やボーダー付き div の代わりに Separator を使う
- ローディングプレースホルダには Skeleton を使う
- カスタムスタイルの span の代わりに Badge を使う

---

## Item は必ず対応する Group コンポーネントの中に置く

コンテンツコンテナの直下に item を直接レンダーしない。

Incorrect:

```tsx
<SelectContent>
  <SelectItem value="apple">Apple</SelectItem>
  <SelectItem value="banana">Banana</SelectItem>
</SelectContent>
```

Correct:

```tsx
<SelectContent>
  <SelectGroup>
    <SelectItem value="apple">Apple</SelectItem>
    <SelectItem value="banana">Banana</SelectItem>
  </SelectGroup>
</SelectContent>
```

これはすべてのグループベースのコンポーネントに当てはまる。

| Item | Group |
|------|-------|
| `SelectItem`, `SelectLabel` | `SelectGroup` |
| `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSub` | `DropdownMenuGroup` |
| `MenubarItem` | `MenubarGroup` |
| `ContextMenuItem` | `ContextMenuGroup` |
| `CommandItem` | `CommandGroup` |
| `MessageScrollerItem` | `MessageScrollerContent` |
| `Message` (同一送信者の連続) | `MessageGroup` |
| `Bubble` (スタック表示) | `BubbleGroup` |
| `Attachment` (横並び) | `AttachmentGroup` |

チャットコンポーネントは決まった順序でネストする (`MessageScrollerProvider` → `MessageScroller` → `MessageScrollerViewport` → `MessageScrollerContent` → `MessageScrollerItem`)。[chat.md](./chat.md) を参照。

---

## コールアウトには Alert を使う

```tsx
<Alert>
  <AlertTitle>Warning</AlertTitle>
  <AlertDescription>Something needs attention.</AlertDescription>
</Alert>
```

---

## 空状態には Empty コンポーネントを使う

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><FolderIcon /></EmptyMedia>
    <EmptyTitle>No projects yet</EmptyTitle>
    <EmptyDescription>Get started by creating a new project.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Create Project</Button>
  </EmptyContent>
</Empty>
```

---

## トースト通知はプロジェクトの base に従う

Base UI プロジェクトでは `toast` コンポーネントを使う。

```tsx
import { toast } from "@/components/ui/toast"

toast.add({
  title: "Changes saved.",
})
```

Radix と React Aria プロジェクトでは Sonner を使う。

```tsx
import { toast } from "sonner"

toast.success("Changes saved.")
toast.error("Something went wrong.")
toast("File deleted.", {
  action: { label: "Undo", onClick: () => undoDelete() },
})
```

---

## オーバーレイ系コンポーネントの選び方

| ユースケース                            | コンポーネント |
|----------------------------------------|---------------|
| 入力を伴う集中タスク                    | `Dialog`      |
| 破壊的アクションの確認                  | `AlertDialog` |
| 詳細やフィルタを表示するサイドパネル    | `Sheet`       |
| モバイル優先のボトムパネル              | `Drawer`      |
| ホバーで素早く情報を出す                | `HoverCard`   |
| クリックで小さなコンテキストを出す      | `Popover`     |

---

## Dialog、Sheet、Drawer には必ず Title が必要

アクセシビリティのため `DialogTitle`、`SheetTitle`、`DrawerTitle` は必須。視覚的に隠す場合は `className="sr-only"` を使う。

```tsx
<DialogContent>
  <DialogHeader>
    <DialogTitle>Edit Profile</DialogTitle>
    <DialogDescription>Update your profile.</DialogDescription>
  </DialogHeader>
  ...
</DialogContent>
```

---

## Card の構造

完全なコンポジションを使う。すべてを `CardContent` に詰め込まない。

```tsx
<Card>
  <CardHeader>
    <CardTitle>Team Members</CardTitle>
    <CardDescription>Manage your team.</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>
    <Button>Invite</Button>
  </CardFooter>
</Card>
```

---

## Button に isPending や isLoading の prop はない

`Spinner` + `data-icon` + `disabled` でコンポジションする。

```tsx
<Button disabled>
  <Spinner data-icon="inline-start" />
  Saving...
</Button>
```

---

## TabsTrigger は TabsList の中に置く

`TabsTrigger` を `Tabs` 直下にレンダーしない。必ず `TabsList` で包む。

```tsx
<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">...</TabsContent>
</Tabs>
```

---

## Avatar には必ず AvatarFallback が必要

画像のロードに失敗した場合のため、必ず `AvatarFallback` を含める。

```tsx
<Avatar>
  <AvatarImage src="/avatar.png" alt="User" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

---

## カスタムマークアップの代わりに既存コンポーネントを使う

| 代わりに | 使うもの |
|---|---|
| `<hr>` や `<div className="border-t">` | `<Separator />` |
| スタイル付き div を使った `<div className="animate-pulse">` | `<Skeleton className="h-4 w-3/4" />` |
| `<span className="rounded-full bg-green-100 ...">` | `<Badge variant="secondary">` |
