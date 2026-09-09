---
name: e2e-testing
description: Playwright を用いた E2E テストパターン、Page Object Model、設定、CI/CD 連携、アーティファクト管理、フレーキーテスト対策、クリティカルフローのテスト。E2E テスト追加・既存テスト改修・テスト構成設計・フレーキーテスト対処・CI 連携・Playwright 設定調整を行う際は必ず本スキルを参照する。
metadata:
  source: "affaan-m/everything-claude-code@skills/e2e-testing"
  sourceVersion: "d29cf651c795869f733669c33e3d33dfd8307d10"
---

# E2E テストパターン

安定で高速、保守性のある E2E テストスイートを構築するための Playwright パターン集。詳細は `references/` 配下を参照する。

## 起動タイミング

- 新しい E2E テストを追加するとき
- 既存テストの改修・リファクタリングを行うとき
- Playwright の設定（リトライ、並列度、reporter）を調整するとき
- フレーキーなテストに対処するとき
- CI/CD パイプラインに E2E を組み込むとき
- 決済・認証など重要なユーザーフローを保護するとき

## 主要原則

- Page Object Model: セレクタとアクションを Page クラスに集約し、スペックから UI 詳細を排除する
- `data-testid` を優先: UI/CSS 変更に強いセレクタを最優先で使う
- 明示的な待機: `waitForTimeout` を使わず、API レスポンスや要素の状態で待つ
- フレーキーは隔離が先: 修正中は `fixme` / `skip` で main を緑に保ち、Issue 番号で追跡
- アーティファクトは失敗時のみ: スクリーンショット／動画／トレースは失敗時のみ保存して容量を抑える
- CI と本番を明確に区別: `process.env.CI` / `NODE_ENV === 'production'` で挙動を切り替える

## 詳細リファレンス

| トピック | ファイル |
|---|---|
| ファイル構成、Page Object Model、セレクタ優先順位 | `references/structure-and-pom.md` |
| Playwright 設定とアーティファクト管理 | `references/configuration.md` |
| フレーキーテスト対処（隔離、特定、よくある原因と修正） | `references/flaky-tests.md` |
| CI/CD 連携、レポートテンプレート、外部モック、クリティカルフロー | `references/ci-and-reports.md` |
