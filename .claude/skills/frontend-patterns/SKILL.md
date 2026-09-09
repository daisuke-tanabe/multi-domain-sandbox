---
name: frontend-patterns
description: React、Next.js、状態管理、パフォーマンス最適化、フォーム、アニメーション、UI ベストプラクティスのためのフロントエンド開発パターン。React コンポーネント設計・カスタムフック作成・状態管理選定・レンダリング最適化・フォーム実装・モーダル/ドロップダウン等のインタラクション実装を行う際は必ず本スキルを参照する。
metadata:
  source: "affaan-m/everything-claude-code@skills/frontend-patterns"
  sourceVersion: "d29cf651c795869f733669c33e3d33dfd8307d10"
---

# フロントエンド開発パターン

React・Next.js 向けの設計パターンとベストプラクティスを集約。詳細実装例は `references/` 配下を参照する。

## 起動タイミング

- React コンポーネントを構築するとき（コンポジション、props、レンダリング）
- 状態を管理するとき（useState、useReducer、Context、外部ライブラリ）
- データ取得を実装するとき（カスタムフック、SWR、React Query）
- パフォーマンスを最適化するとき（メモ化、仮想化、コード分割）
- フォームを扱うとき（バリデーション、controlled inputs、Zod schema）
- モーダル・ドロップダウン・タブなどのインタラクティブ UI を実装するとき
- アニメーションを実装するとき

## 主要原則

- 継承よりコンポジション: 親コンポーネントを共通化するより、子を組み合わせて再利用する
- 状態は局所化: 必要なコンポーネントだけが知る形にし、肥大化したら `useReducer` + `Context` へ昇格
- メモ化は計測してから: 闇雲な `useMemo` / `useCallback` はノイズ。プロファイラで重い箇所だけ最適化
- 仮想化は閾値超で導入: 100 件未満は素直に描画、それ以上から `@tanstack/react-virtual` を検討
- アクセシビリティは後付けしない: ARIA 属性・キーボード操作・フォーカス管理は最初から設計に含める

## 詳細リファレンス

| トピック | ファイル |
|---|---|
| コンポーネント設計（コンポジション、Compound Components、Render Props、Error Boundary） | `references/components.md` |
| カスタムフック（useToggle、useQuery、useDebounce） | `references/hooks.md` |
| 状態管理（Context + Reducer、外部ライブラリ判断軸） | `references/state-management.md` |
| パフォーマンス（メモ化、コード分割、仮想化） | `references/performance.md` |
| フォーム（Controlled Form、ライブラリ採用判断） | `references/forms.md` |
| アニメーションとアクセシビリティ実装（Framer Motion、キーボード操作、フォーカス管理） | `references/animations-and-a11y.md` |
