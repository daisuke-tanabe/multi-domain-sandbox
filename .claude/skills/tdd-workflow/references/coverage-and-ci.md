# カバレッジ・継続的テスト・CI 連携

## カバレッジレポートの実行

```bash
npm run test:coverage
```

## カバレッジしきい値

```json
{
  "jest": {
    "coverageThresholds": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

## カバレッジの読み方

- 80% は最低ラインであって目標ではない。クリティカルパス（決済、認証、データ整合性）は 100% を目指す
- 行カバレッジだけでは不十分。`branches` と `functions` のしきい値も同時に設定する
- カバーされていない行は 意図的にスキップ（テスト不可能な箇所）か 追加すべきテスト かを判別する
- カバーされている行が 意味のあるアサーション を伴っているかは別問題。カバレッジ通過だけを目的化しない

## 開発中の Watch モード

```bash
npm test -- --watch
# Tests run automatically on file changes
```

## Pre-Commit Hook

```bash
# Runs before every commit
npm test && npm run lint
```

## CI/CD 統合（GitHub Actions 例）

```yaml
- name: Run Tests
  run: npm test -- --coverage
- name: Upload Coverage
  uses: codecov/codecov-action@v3
```

ポイント:
- PR 時にカバレッジレポートをアップロードして可視化する
- カバレッジが下がる PR は警告が出るよう設定する（codecov の status check 等）
- E2E テストが遅いなら、ユニット／統合とは別ジョブにする
