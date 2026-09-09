---
name: find-skills
description: ユーザーが「X をどうやるか」「X 用のスキルを探して」「〜できるスキルはある？」といった質問をしたり、エージェントの機能拡張に関心を示した際に、agent skill の発見とインストールを支援する。インストール可能なスキルとして存在しそうな機能をユーザーが探しているときに本スキルを利用する。
metadata:
  source: "vercel-labs/skills@skills/find-skills"
  sourceVersion: "773fb2c7bbf16781670a3520affc4abd0c6151ae"
---

# Find Skills

このスキルは、オープンな agent skills エコシステムからスキルを発見しインストールするのを支援する。

## このスキルを使うタイミング

次のような場合にこのスキルを使う。

- ユーザーが「X をどうやるか」と尋ね、X が既存スキルで扱えそうな一般的タスクであるとき
- ユーザーが「X 用のスキルを探して」「X 向けのスキルはある？」と言ったとき
- ユーザーが「X はできる？」と尋ね、X が専門的な機能であるとき
- エージェントの機能拡張に関心を示したとき
- ツール・テンプレート・ワークフローを探したいと言ったとき
- 特定領域（デザイン、テスト、デプロイなど）のサポートが欲しいと述べたとき

## Skills CLI とは

Skills CLI (`npx skills`) はオープンな agent skills エコシステム向けのパッケージマネージャー。スキルは、専門知識・ワークフロー・ツールでエージェントの機能を拡張するモジュール化されたパッケージである。

主なコマンド:

- `npx skills find [query] [--owner <owner>]` — 対話的またはキーワードでスキルを検索する。GitHub の owner で絞り込める
- `npx skills add <package>` — GitHub などのソースからスキルをインストールする
- `npx skills update` — インストール済みのスキルをすべて更新する

スキルを閲覧する: https://skills.sh/

## スキル発見の支援方法

### Step 1: 必要なものを理解する

ユーザーが何かについて支援を求めたら、次を特定する。

1. ドメイン（例: React, テスト, デザイン, デプロイ）
2. 具体的なタスク（例: テスト作成, アニメーション作成, PR レビュー）
3. それがスキルとして存在していそうなくらい一般的なタスクか

### Step 2: まずはリーダーボードを確認する

CLI 検索を実行する前に、[skills.sh のリーダーボード](https://skills.sh/) を確認し、そのドメインに既によく知られたスキルが存在するかを見る。リーダーボードは累計インストール数でスキルを順位付けし、もっとも人気で実戦投入されている選択肢を浮かび上がらせる。

たとえば、Web 開発向けのトップスキルには次のようなものがある。
- `vercel-labs/agent-skills` — React, Next.js, Web デザイン（それぞれ 10 万インストール以上）
- `anthropics/skills` — フロントエンドデザイン, ドキュメント処理（10 万インストール以上）

### Step 3: スキルを検索する

リーダーボードでユーザーのニーズを満たせない場合は find コマンドを実行する。

```bash
npx skills find [query] [--owner <owner>]
```

例:

- ユーザーが「React アプリを速くするには？」と尋ねる → `npx skills find react performance`
- ユーザーが「PR レビューを手伝って」と尋ねる → `npx skills find pr review`
- ユーザーが「changelog を作りたい」と言う → `npx skills find changelog`

### Step 4: 推奨する前に品質を検証する

検索結果だけを根拠にスキルを推奨してはならない。 必ず次を検証する。

1. インストール数 — 1,000 件以上のスキルを優先する。100 件未満には慎重になる。
2. ソースの信頼性 — 公式ソース (`vercel-labs`, `anthropics`, `microsoft`) は未知の作者より信頼できる。
3. GitHub のスター数 — ソースリポジトリを確認する。100 スター未満のリポジトリ由来のスキルは懐疑的に扱う。

### Step 5: ユーザーに選択肢を提示する

関連スキルが見つかったら、次の情報とともにユーザーに提示する。

1. スキル名とその機能
2. インストール数とソース
3. ユーザーが実行できるインストールコマンド
4. skills.sh の詳細リンク

応答例:

```
役立ちそうなスキルが見つかりました! "react-best-practices" スキルは
Vercel Engineering による React および Next.js のパフォーマンス最適化ガイドラインを提供します。
(185K installs)

インストール:
npx skills add vercel-labs/agent-skills@react-best-practices

詳細: https://skills.sh/vercel-labs/agent-skills/react-best-practices
```

### Step 6: インストールを提案する

ユーザーが進めたい場合は、こちらでスキルをインストールできる。

```bash
npx skills add <owner/repo@skill> -g -y
```

`-g` フラグはグローバル（ユーザーレベル）にインストールし、`-y` は確認プロンプトをスキップする。

## よくあるスキルカテゴリー

検索の際は、次のような一般的カテゴリーを考慮する。

| カテゴリー       | クエリ例                                 |
| --------------- | ---------------------------------------- |
| Web 開発        | react, nextjs, typescript, css, tailwind |
| テスト           | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| ドキュメント     | docs, readme, changelog, api-docs        |
| コード品質       | review, lint, refactor, best-practices   |
| デザイン         | ui, ux, design-system, accessibility     |
| 生産性           | workflow, automation, git                |

## 効果的に検索するコツ

1. 具体的なキーワードを使う: 単に "testing" より "react testing" のほうがよい
2. 言い換えを試す: "deploy" でヒットしなければ "deployment" や "ci-cd" を試す
3. 人気のあるソースを確認する: 多くのスキルは `vercel-labs/agent-skills` や `ComposioHQ/awesome-claude-skills` から提供されている

## スキルが見つからないとき

関連スキルが存在しない場合:

1. 既存スキルが見つからなかったことを認める
2. 汎用的な能力でそのまま支援することを申し出る
3. `npx skills init` で独自スキルを作成できることを提案する

例:

```
"xyz" に関するスキルを検索しましたが、該当するものは見つかりませんでした。
このタスクは直接お手伝いできます! このまま進めてよいですか?

頻繁に行う作業なら、独自のスキルを作成することもできます:
npx skills init my-xyz-skill
```
