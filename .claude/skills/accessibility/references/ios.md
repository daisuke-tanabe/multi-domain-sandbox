# iOS (SwiftUI) アクセシビリティ実装

SwiftUI の標準コンポーネント（`Button`、`Toggle`、`TextField` 等）は VoiceOver と既定で連携する。アイコンのみのコントロールやカスタム描画には明示的なアクセシビリティ修飾子を追加する。

## アクセシビリティ修飾子の使い分け

| 機能 | 修飾子 |
|---|---|
| 主要ラベル | `.accessibilityLabel("...")` |
| 補助ヒント | `.accessibilityHint("...")` |
| アクションロール | `.accessibilityAddTraits(.isButton)` 等 |
| ライブ更新 | `.accessibilityLiveRegion(.polite)` |

## アクセシブルなアイコンボタン

```swift
Button(action: deleteItem) {
    Image(systemName: "trash")
}
.accessibilityLabel("Delete item")
.accessibilityHint("Permanently removes this item from your list")
.accessibilityAddTraits(.isButton)
```

ポイント:
- アイコンのみの Button は VoiceOver から「ゴミ箱イメージ」と読まれてしまうため、`accessibilityLabel` で意図を明示
- `accessibilityHint` で操作の結果（破壊的かどうか等）を補足
- `Button` 自体は `.isButton` を持つが、`Image` を直接 tap gesture でラップした場合は明示的に追加

## ターゲットサイズ

- WCAG SC 2.5.8 の最低 24×24 CSS ピクセル
- iOS HIG 推奨は 44×44 pt
- `Button` のデフォルトのタップ領域だけでは不足することが多いので、`.frame(minWidth: 44, minHeight: 44)` で明示的に確保

## カスタムビューのセマンティック化

```swift
HStack {
    Image(systemName: "bell.fill")
    Text("3")
}
.accessibilityElement(children: .ignore)
.accessibilityLabel("3 unread notifications")
```

`accessibilityElement(children: .ignore)` で個々の子要素を VoiceOver から隠し、親に統合ラベルを付与することで、まとまった意味として読み上げさせる。

## Dynamic Type

- フォントサイズはユーザー設定に追従させる（`.font(.body)` 等のスタイルセマンティクスを使用）
- 固定 pt サイズはアクセシビリティ設定の文字サイズ拡大を阻害する

## 参考資料

- [iOS Accessibility Programming Guide](https://developer.apple.com/documentation/accessibility)
- [iOS Human Interface Guidelines - Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
