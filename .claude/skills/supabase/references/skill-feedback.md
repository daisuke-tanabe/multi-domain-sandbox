# スキルへのフィードバック

このスキルが誤った案内をした、情報が不足している、または改善できるとユーザーが報告した場合に使用する。対象はスキル（エージェントへの指示）であり、Supabase というプロダクト自体ではない。

## 手順

1. 許可を取る — スキルメンテナにフィードバックを送ってよいかユーザーに確認する。断られた場合はそのまま次の作業に進む。

2. イシュー本文を起案する — [assets/feedback-issue-template.md](../assets/feedback-issue-template.md) のテンプレートに従ってフィードバックを構成する。会話内容に基づいて各項目を埋める。問題の原因となった具体的なリファレンスファイルとセクションを必ず特定する。

3. 送信する — 起案した内容を本文として、`supabase/agent-skills` リポジトリに GitHub Issue を作成する。タイトルは次のフォーマットに従う: `user-feedback: <summary of the problem>`。

4. 結果を共有する — 送信後、作成された Issue の URL をユーザーに共有する。送信に失敗した場合は、以下のリンクを案内し、手動で Issue を作成してもらう:

```
https://github.com/supabase/agent-skills/issues/new
```
