# AWS へのデプロイ

## 結論

専用アカウント `multi-domain-sandbox` に、ECS Fargate + ALB、RDS PostgreSQL、ElastiCache Redis、Cognito User Pool を Terraform で作る。
ドメインは `sandbox.daisuke-tanabe.dev` を新アカウントのホストゾーンとして作り、親ゾーンから NS 委任する。
初回は `scripts/tf-bootstrap.sh` → `scripts/deploy.sh --init` → `scripts/delegate-dns.sh` → `scripts/run-provision.sh` の順で実行する。

## 構成

| 要素 | 内容 |
| --- | --- |
| ネットワーク | VPC 10.20.0.0/16。public subnet 2 つに ALB と Fargate タスク、private subnet 2 つに RDS と Redis。NAT なし |
| 実行基盤 | ECS Fargate ARM64。auth-server / tenant-web / api-server を各 1 タスク。provision は一回限りのタスク |
| ルーティング | ALB のホストベース。`auth.<domain>` → auth-server、`api.<domain>` → api-server、`*.<domain>` → tenant-web |
| 証明書 | ACM。`*.<domain>` と `<domain>` を DNS 検証 |
| DB | RDS PostgreSQL 16、db.t4g.micro、単一 AZ。`rds.force_ssl=1` のため接続 URL に `sslmode=no-verify` を付ける。ロールは provision タスクが作る |
| Session Store | ElastiCache Redis 7、cache.t4g.micro、単一ノード、VPC 内のみ |
| 認証 | Cognito User Pool。Hosted UI なし。App Client は secret 付きで USER_SRP_AUTH のみ許可 |
| 秘密値 | Secrets Manager。DB パスワード、署名鍵、Token 暗号化鍵、client_secret、テストユーザーのパスワード |
| ログ | CloudWatch Logs。`/ecs/multi-domain-sandbox/<app>` |

ローカルとの差分は環境変数だけで吸収する。`COOKIE_SECURE=true` で `__Host-` プレフィックス、`COGNITO_ADAPTER=sdk` で実 Cognito、`REDIS_URL` で Redis を使う。

## 事前準備

- `aws sso login --profile multi-domain-sandbox` が通っていること
- 親ゾーン `daisuke-tanabe.dev` を持つ `daisuke-tanabe` プロファイルもログイン済みであること。NS 委任にだけ使う
- Docker が起動していること。イメージは linux/arm64 でビルドする

## 初回手順

```bash
# 1. state バケット
scripts/tf-bootstrap.sh

# 2. ECR を作ってイメージを push し、全リソースを apply
scripts/deploy.sh --init

# 3. 親ゾーンに NS 委任。ACM の DNS 検証はこの後に通る
PARENT_PROFILE=daisuke-tanabe scripts/delegate-dns.sh

# 4. 委任が伝播したら証明書の検証待ちを含めてもう一度 apply
cd terraform && terraform apply -var image_tag=$(git rev-parse --short HEAD)

# 5. RDS のスキーマ、Cognito テストユーザー、シードを投入
scripts/run-provision.sh
```

手順 2 では ACM の検証待ちで apply が止まることがある。その場合は手順 3 を先に実行してから手順 2 を再実行する。

## テストユーザー

ローカルと同じ alice / bob / carol を Cognito に作る。パスワードは Terraform が生成し Secrets Manager に置く。

```bash
aws secretsmanager get-secret-value --secret-id multi-domain-sandbox/seed \
  --query SecretString --output text | jq -r .user_password
```

## 2 回目以降

```bash
scripts/deploy.sh
```

git の短縮 SHA をイメージタグにして push し、タスク定義を更新する。

## 確認

```bash
cd terraform && terraform output urls
```

ブラウザで `https://tenant-a.sandbox.daisuke-tanabe.dev/projects` を開き、alice でログインする。
`SANDBOX_BASE_URL` を指定すれば smoke と chrome-check を本番 URL に向けられる。

## 撤去

```bash
cd terraform && terraform destroy
```

ECR は `force_delete`、RDS は `skip_final_snapshot`、Secrets Manager は即時削除に設定してあるため、destroy だけで消える。state バケットと親ゾーンの NS レコードは手動で消す。

## 費用の目安

ap-northeast-1 で常時起動した場合の概算。

| 項目 | 月額の目安 |
| --- | --- |
| Fargate 0.25 vCPU / 0.5 GB × 3 | 約 2,500 円 |
| ALB | 約 3,500 円 + 転送量 |
| RDS db.t4g.micro + 20 GB | 約 2,500 円 |
| ElastiCache cache.t4g.micro | 約 2,000 円 |
| Route 53 ホストゾーン、Secrets Manager、CloudWatch | 数百円 |

合計で月 1 万円強。検証が終わったら destroy する。

## 本番へ持ち出すときの差分

- Redis を transit encryption + AUTH 付きにし、`rediss://` で接続する
- RDS を Multi-AZ にし、削除保護と最終スナップショットを有効にする
- Secrets を Terraform の生成値ではなく Secret Store で管理し、state から外す
- RDS の CA 証明書を同梱して `sslmode=verify-full` にする
- NAT Gateway か VPC Endpoint を置き、タスクを private subnet に移す
- ECS のオートスケールと ALB のアクセスログを設定する
