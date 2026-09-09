# デプロイメント戦略

## Rolling Deployment（デフォルト）

インスタンスを段階的に置き換える。ロールアウト中は新旧バージョンが同時稼働する。

```
Instance 1: v1 → v2  (update first)
Instance 2: v1        (still running v1)
Instance 3: v1        (still running v1)

Instance 1: v2
Instance 2: v1 → v2  (update second)
Instance 3: v1

Instance 1: v2
Instance 2: v2
Instance 3: v1 → v2  (update last)
```

利点: ダウンタイムゼロ、段階的なロールアウト
欠点: 2 バージョンが同時稼働するため、後方互換な変更が必須
用途: 標準的なデプロイ、後方互換な変更

## Blue-Green Deployment

同一構成の 2 環境を稼働させ、トラフィックをアトミックに切り替える。

```
Blue  (v1) ← traffic
Green (v2)   idle, running new version

# After verification:
Blue  (v1)   idle (becomes standby)
Green (v2) ← traffic
```

利点: 即時ロールバック（blue へ戻す）、クリーンな切り替え
欠点: デプロイ中はインフラを 2 倍必要とする
用途: クリティカルなサービス、障害許容ゼロ

## Canary Deployment

少量のトラフィックだけを新バージョンへ先行ルーティングする。

```
v1: 95% of traffic
v2:  5% of traffic  (canary)

# If metrics look good:
v1: 50% of traffic
v2: 50% of traffic

# Final:
v2: 100% of traffic
```

利点: 全面ロールアウト前に実トラフィックで問題を検出できる
欠点: トラフィック分割インフラとモニタリングが必要
用途: 高トラフィックサービス、リスクの高い変更、フィーチャーフラグ

## 選び方

| 条件 | 推奨 |
|---|---|
| 後方互換性が確実、デフォルト | Rolling |
| 障害許容ゼロ、即時ロールバック必須 | Blue-Green |
| 高トラフィック、リスク高、メトリクス完備 | Canary |
| Breaking change を含む | Blue-Green か Canary（Rolling は不可） |
