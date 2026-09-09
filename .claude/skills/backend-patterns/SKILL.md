---
name: backend-patterns
description: Node.js、Express、Next.js API ルート向けのバックエンドアーキテクチャパターン、レイヤー分割、データベース最適化、キャッシュ、エラー処理、認証・認可、レート制限、バックグラウンドジョブ、ロギング。API ハンドラ作成・サーバーサイドの設計判断・データベースクエリ実装・認証認可組み込み・エラーハンドリング設計を行う際は必ず本スキルを参照する。
metadata:
  source: "affaan-m/everything-claude-code@skills/backend-patterns"
  sourceVersion: "d29cf651c795869f733669c33e3d33dfd8307d10"
---

# バックエンド開発パターン

スケーラブルなサーバーサイドアプリケーション向けのアーキテクチャパターン集。詳細実装例は `references/` 配下を参照する。

## 起動タイミング

- REST または GraphQL API エンドポイントを設計するとき
- repository / service / controller レイヤーを実装するとき
- データベースクエリを最適化するとき（N+1、インデックス、コネクションプーリング）
- キャッシュを追加するとき（Redis、インメモリ、HTTP キャッシュヘッダー）
- バックグラウンドジョブや非同期処理を構築するとき
- API のエラー処理とバリデーションを構造化するとき
- ミドルウェア（auth、logging、rate limiting）を組み込むとき

## 主要原則

- レイヤーを分ける: Repository（データアクセス）／ Service（ビジネスロジック）／ ハンドラ（HTTP 入出力）の責務を混ぜない
- データアクセスは抽象化: ORM やストレージの詳細をインターフェースの後ろに隠し、テスト時にモック可能にする
- N+1 を作らない: ループ内で 1 件ずつ取得しない、ID をまとめて 1 クエリで取得して Map で結合する
- エラーは型で表現: `ApiError` のような専用クラスを定義し、ハンドラ末尾の単一エントリで型分岐させる
- 冪等性を意識: リトライ可能な操作（GET / PUT / DELETE）と非冪等（POST）を区別する
- 境界でバリデーション: 受信データは必ずスキーマ検証（Zod 等）してから内部に流す

## 詳細リファレンス

| トピック | ファイル |
|---|---|
| API 設計（REST 構造、Repository、Service、Middleware） | `references/api-and-layers.md` |
| データベース（クエリ最適化、N+1 防止、トランザクション） | `references/database.md` |
| キャッシュ（Redis ラッパー、Cache-Aside、TTL 設計） | `references/caching.md` |
| エラー処理（集約型ハンドラー、指数バックオフリトライ） | `references/error-handling.md` |
| 認証・認可・レート制限（JWT、RBAC、Rate Limiter） | `references/auth-and-rate-limiting.md` |
| バックグラウンドジョブと構造化ロギング | `references/jobs-and-logging.md` |
