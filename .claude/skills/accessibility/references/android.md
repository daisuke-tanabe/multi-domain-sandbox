# Android (Jetpack Compose) アクセシビリティ実装

Compose の Material コンポーネントは TalkBack と既定で連携する。カスタムコンポーネントには `Modifier.semantics` で意味を明示する。

## semantics の使い分け

| 機能 | 修飾子 |
|---|---|
| 主要ラベル | `Modifier.semantics { contentDescription = "..." }` |
| 補助ヒント | `Modifier.semantics { stateDescription = "..." }` |
| アクションロール | `Modifier.semantics { role = Role.Button }` |
| ライブ更新 | `Modifier.semantics { liveRegion = LiveRegionMode.Polite }` |

## アクセシブルなトグル

```kotlin
Switch(
    checked = isEnabled,
    onCheckedChange = { onToggle() },
    modifier = Modifier.semantics {
        contentDescription = "Enable notifications"
    }
)
```

ポイント:
- `Switch` は標準で Role.Switch を持つが、トグル対象が文脈不明だと TalkBack が意図を伝えきれないので `contentDescription` で対象を明示
- 状態（"on"/"off"）は Compose が自動で読み上げる

## アイコンのみボタン

```kotlin
IconButton(onClick = onDelete) {
    Icon(
        imageVector = Icons.Default.Delete,
        contentDescription = "Delete item"
    )
}
```

`Icon` の `contentDescription` を必ず指定。装飾用なら `null` を設定（明示的に「読み上げ不要」を宣言）。

## ターゲットサイズ

- Material のクリック可能コンポーネントは最低 48×48 dp を確保
- カスタムの `Modifier.clickable` では `Modifier.minimumInteractiveComponentSize()` で同等のサイズを確保

## カスタムビューのセマンティック化

```kotlin
Row(
    modifier = Modifier.semantics(mergeDescendants = true) {
        contentDescription = "3 unread notifications"
    }
) {
    Icon(Icons.Default.Notifications, contentDescription = null)
    Text("3")
}
```

`mergeDescendants = true` で子要素をまとめ、親の `contentDescription` を読み上げる。子の個別の説明は `null` にしておく。

## 参考資料

- [Android Accessibility Developer Guide](https://developer.android.com/guide/topics/ui/accessibility)
- [Compose Accessibility](https://developer.android.com/jetpack/compose/accessibility)
