# Sections

このファイルはすべてのセクション、その並び順、影響度レベル、説明を定義する。
括弧内のセクション ID は、ルールをグルーピングするためのファイル名プレフィックス。

---

## 1. ウォーターフォールの排除 (async)

Impact: CRITICAL  
Description: ウォーターフォールはパフォーマンス低下の最大要因。逐次的な await は毎回ネットワークレイテンシを丸ごと積み増す。これを排除すると最も大きな効果が得られる。

## 2. バンドルサイズ最適化 (bundle)

Impact: CRITICAL  
Description: 初期バンドルサイズを減らすことで Time to Interactive と Largest Contentful Paint が改善する。

## 3. サーバーサイドパフォーマンス (server)

Impact: HIGH  
Description: サーバーサイドレンダリングとデータ取得を最適化することで、サーバーサイドのウォーターフォールを排除しレスポンス時間を短縮する。

## 4. クライアントサイドのデータ取得 (client)

Impact: MEDIUM-HIGH  
Description: 自動的な重複排除と効率的なデータ取得パターンで、冗長なネットワークリクエストを減らす。

## 5. 再レンダリング最適化 (rerender)

Impact: MEDIUM  
Description: 不要な再レンダリングを減らすことで、無駄な計算を最小化し UI の応答性を高める。

## 6. レンダリングパフォーマンス (rendering)

Impact: MEDIUM  
Description: レンダリング処理を最適化することで、ブラウザに必要な作業量を減らす。

## 7. JavaScript パフォーマンス (js)

Impact: LOW-MEDIUM  
Description: ホットパスへのマイクロ最適化を積み重ねると、意味のある改善につながる。

## 8. 高度なパターン (advanced)

Impact: LOW  
Description: 特定の状況で慎重な実装を要する高度なパターン。
