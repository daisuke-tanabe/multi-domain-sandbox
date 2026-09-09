---
description: カバレッジを解析し、ギャップを特定し、目標閾値に向けて不足するテストを生成する
---

# Test Coverage

テストカバレッジを解析し、ギャップを特定し、80%以上に到達するため不足テストを生成する。

## Step 1: テストフレームワークの検出

| 指標 | カバレッジコマンド |
|-----------|-----------------|
| `jest.config.*` または `package.json` の jest | `npx jest --coverage --coverageReporters=json-summary` |
| `vitest.config.*` | `npx vitest run --coverage` |
| `pytest.ini` / `pyproject.toml` の pytest | `pytest --cov=src --cov-report=json` |
| `Cargo.toml` | `cargo llvm-cov --json` |
| JaCoCo付き `pom.xml` | `mvn test jacoco:report` |
| `go.mod` | `go test -coverprofile=coverage.out ./...` |

## Step 2: カバレッジレポートの解析

1. カバレッジコマンドを実行する
2. 出力（JSONサマリまたはターミナル出力）をパースする
3. **80%未満** のファイルを悪い順に並べる
4. 各カバレッジ不足ファイルについて特定する：
   - 未テストの関数 / メソッド
   - ブランチカバレッジの不足（if/else、switch、エラーパス）
   - 分母を膨らませているデッドコード

## Step 3: 不足テストの生成

各カバレッジ不足ファイルについて、次の優先順でテストを生成する：

1. **正常系** — 妥当な入力でのコア機能
2. **エラーハンドリング** — 不正入力、データ不在、ネットワーク障害
3. **エッジケース** — 空配列、null/undefined、境界値（0、-1、MAX_INT）
4. **ブランチカバレッジ** — 各 if/else、switch case、三項

### テスト生成ルール

- テストはソースに隣接配置する：`foo.ts` → `foo.test.ts`（またはプロジェクト規約）
- プロジェクト既存のテストパターンに従う（import スタイル、アサーションライブラリ、モック方法）
- 外部依存（DB、API、ファイルシステム）はモック化する
- 各テストは独立させる — テスト間で可変状態を共有しない
- テスト名は記述的に：`test_create_user_with_duplicate_email_returns_409`

## Step 4: 検証

1. テストスイート全体を実行 — 全テストPASS必須
2. カバレッジを再実行 — 改善を検証
3. まだ80%未満なら、残ギャップに対して Step 3 を繰り返す

## Step 5: 報告

before/after を比較表示する：

```
Coverage Report
──────────────────────────────
File                   Before  After
src/services/auth.ts   45%     88%
src/utils/validation.ts 32%    82%
──────────────────────────────
Overall:               67%     84%  PASS:
```

## 重点領域

- 複雑な分岐を持つ関数（高循環的複雑度）
- エラーハンドラと catch ブロック
- コードベース横断で使われるユーティリティ関数
- APIエンドポイントハンドラ（request → response フロー）
- エッジケース：null、undefined、空文字列、空配列、ゼロ、負数
