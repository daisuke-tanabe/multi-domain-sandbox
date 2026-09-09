---
name: update-external-skills
description: 外部由来スキルを upstream から更新するワークフロー。.claude/skills 配下で metadata.source を持つスキルの更新確認・取得・翻訳・再構成・適用を行う。「スキルを更新して」「upstream に追従して」「外部スキルの更新を確認して」といった依頼、および新しい外部スキルを取り込む際に使用する。
argument-hint: "[skill 名...]"
---

# 外部スキルの更新

対象スキル: $ARGUMENTS

スキル名が渡された場合はそのスキルだけを対象にする。空なら外部由来スキル全件を対象にする。

## 出所の規約

- 外部由来スキルは SKILL.md frontmatter の `metadata.source` に出所を持つ
  - 形式は `<owner>/<repo>@<repo 内パス>`。例: `affaan-m/everything-claude-code@skills/api-design`
  - `metadata.sourceVersion` は最後に取り込んだ upstream の commit SHA。未設定なら SHA 追跡開始前の取り込みを意味する
  - `metadata.sourceNote` は upstream 側の廃止・分割・移転などの特記事項
- `source` を持たないスキルはオリジナルであり、本ワークフローの対象外
- 例外: `source: "OpenSpec CLI"` のスキルは `openspec update` で再生成する。翻訳・適用の手順は使わない

## 更新手順

1. 対象列挙: `grep -l "^  source:" .claude/skills/*/SKILL.md` で外部由来スキルを列挙する
2. 更新確認: upstream の対象パスの最新 commit SHA を取得し、`sourceVersion` と比較する

   ```bash
   gh api "repos/<owner>/<repo>/commits?path=<repo 内パス>&per_page=1" --jq '.[0].sha'
   ```

   一致すれば更新不要。`sourceVersion` が未設定の場合は upstream の現内容とローカルを突き合わせて判断する
3. 取得: `gh api repos/<owner>/<repo>/contents/<パス>` で SKILL.md と references 等の全ファイルを取得する
4. 翻訳・再構成: 以下の規約で日本語化する
   - CLAUDE.md の文章スタイルに従う。丸括弧による補足は原則禁止、一文は短く、強調装飾は使わない
   - コード・API 名・コマンド・技術用語は原文のまま残す
   - ローカルの既存構成を維持する。長大な本文は `references/` に分割し、SKILL.md は起動タイミングと索引に絞る
   - description の書き方は既存スキルに揃え、末尾に起動条件を明記する
5. 適用: ディレクトリ名と `name` は upstream と同名を維持する。`metadata.source` / `sourceNote` を保持し、`sourceVersion` を手順 2 で取得した SHA に更新する
6. 検証・コミット: frontmatter が YAML として妥当なこと、`references/` へのリンク切れがないことを確認し、スキル単位でコミットする

## 注意

- ローカルは日本語再構成版のため upstream との機械 diff は意味を持たない。更新要否は `sourceVersion` の SHA 比較で判定する
- upstream でスキルが削除・分割・移転されている場合は勝手に追従しない。`sourceNote` に事実を記録し、ユーザーに判断を仰ぐ
- 新しく外部スキルを取り込む場合も同じ規約で `metadata.source` と `sourceVersion` を必ず付ける
