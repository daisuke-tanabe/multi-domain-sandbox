# AWS へのデプロイ

## 未移行の注意

AWS / Terraform 側はまだ旧構成のままである。旧構成ではテナントごとに OIDC Client を持ち、ホストは `tenant-a.<domain>` / `tenant-b.<domain>`、環境変数は `TENANT_CLIENTS` と `API_AUDIENCE` だった。
アプリと `db/init` はサービス × テナントのモデルに移行済みで、ホストは `<tenant>.crm.<domain>` / `<tenant>.cms.<domain>`、環境変数は tenant-web / provision の `SERVICES` と api-server の `API_HOSTS` / `PUBLIC_SCHEME` に変わっている。
Terraform の ALB ルーティング、ACM 証明書、タスク定義の環境変数、Secrets Manager の client_secret を `*.crm.<domain>` / `*.cms.<domain>` のホストと `SERVICES` シークレットへ移行する作業は別途行う。それまでこの手順で apply しても現在のアプリは起動しない。以下の Terraform に関する記述は旧構成のものをそのまま残している。

## 結論

専用アカウント `multi-domain-sandbox` に、ECS Fargate + ALB、RDS PostgreSQL、ElastiCache Redis、Cognito User Pool を Terraform で作る。
ドメインは `sandbox.daisuke-tanabe.dev` を新アカウントのホストゾーンとして作り、親ゾーンから NS 委任する。
初回は `scripts/tf-bootstrap.sh` → `scripts/deploy.sh --init` → `scripts/delegate-dns.sh` → `scripts/run-provision.sh` の順で実行する。

## 構成

| 要素 | 内容 |
| --- | --- |
| ネットワーク | VPC 10.20.0.0/16。public subnet 2 つに ALB と Fargate タスク、private subnet 2 つに RDS と Redis。NAT なし |
| 実行基盤 | ECS Fargate ARM64。auth-server / tenant-web / api-server を各 1 タスク。provision は一回限りのタスク |
| ルーティング | ALB のホストベース。`auth.<domain>` → auth-server、`api.<domain>` → api-server、`*.<domain>` → tenant-web。移行後は `api.<service>.<domain>` → api-server、`*.<service>.<domain>` → tenant-web |
| 証明書 | ACM。`*.<domain>` と `<domain>` を DNS 検証。移行後は `*.crm.<domain>` / `*.cms.<domain>` も必要 |
| DB | RDS PostgreSQL 16、db.t4g.micro、単一 AZ。`rds.force_ssl=1` のため接続 URL に `sslmode=no-verify` を付ける。ロールは provision タスクが作る |
| Session Store | ElastiCache Redis 7、cache.t4g.micro、単一ノード、VPC 内のみ |
| 認証 | Cognito User Pool。Hosted UI なし。App Client は secret 付きで USER_SRP_AUTH のみ許可 |
| 秘密値 | Secrets Manager。DB パスワード、署名鍵、Token 暗号化鍵、client_secret、テストユーザーのパスワード |
| ログ | CloudWatch Logs。`/ecs/multi-domain-sandbox/<app>` |

ローカルとの差分は環境変数だけで吸収する。`COOKIE_SECURE=true` で `__Host-` プレフィックス、`COGNITO_ADAPTER=sdk` で実 Cognito、`REDIS_URL` で Redis を使う。
アプリ側で必要な環境変数は次のとおり。Terraform のタスク定義はまだこれらを渡していない。

| アプリ | 変数 | 本番の値の例 |
| --- | --- | --- |
| tenant-web | `SERVICES` | `[{"clientId":"crm","clientSecret":"<secret>","name":"CRM","baseHost":"crm.<domain>","apiBaseUrl":"https://api.crm.<domain>"},{"clientId":"cms",...}]` |
| tenant-web / api-server / provision | `PUBLIC_SCHEME` | `https` |
| api-server | `API_HOSTS` | `api.crm.<domain>,api.cms.<domain>` |
| provision | `SERVICES` | tenant-web と同じ JSON。oidc_clients、redirect_uri、backchannel_logout_uri の投入に使う |

## 事前準備

- `aws sso login --profile multi-domain-sandbox` が通っていること
- 親ゾーン `daisuke-tanabe.dev` を持つ `daisuke-tanabe` プロファイルもログイン済みであること。NS 委任にだけ使う
- Docker が起動していること。イメージは linux/arm64 でビルドする

## 初回手順

```bash
# 1. state バケット。terraform/backend.hcl も生成される (git 管理外)
scripts/tf-bootstrap.sh
cd terraform && terraform init -backend-config=backend.hcl && cd ..

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

移行後はブラウザで `https://tanaka.crm.sandbox.daisuke-tanabe.dev/projects` を開き、alice でログインする。
`SANDBOX_DOMAIN` と `SEED_USER_PASSWORD` を指定すれば smoke と chrome-check を AWS の URL に向けられる。両スクリプトは `<tenant>.<service>.<SANDBOX_DOMAIN>` のホストを前提にするため、Terraform の移行が終わるまで AWS に対しては通らない。

```bash
export SANDBOX_DOMAIN=sandbox.daisuke-tanabe.dev
export SEED_USER_PASSWORD=$(aws secretsmanager get-secret-value --secret-id multi-domain-sandbox/seed \
  --query SecretString --output text | jq -r .user_password)
pnpm smoke
pnpm chrome-check
```

## 撤去

```bash
scripts/teardown.sh
```

課金対象をすべて削除し、Route 53 ホストゾーンだけ残す。ゾーンまで消すと親ゾーンの NS 委任が存在しないゾーンを指したまま残り、第三者が同じネームサーバーを引き当ててサブドメインを乗っ取れる。ゾーンは月 0.50 USD で、残しておけば次回は `scripts/deploy.sh --init` と `scripts/run-provision.sh` だけで同じ URL に復元できる。

ECR は `force_delete`、RDS は `skip_final_snapshot`、Secrets Manager は即時削除に設定してあるため、destroy で残るものはない。残るのはホストゾーンと state バケットのみ。完全に撤去する場合は、親ゾーンの NS レコードを先に削除してから `terraform destroy` でゾーンを消し、state バケットを手動で消す。

`terraform destroy -target` でゾーンを除外する方法は取らない。for_each を持つリソースのキーに引用符が含まれ、シェル経由で正しく渡しにくい。スクリプトはゾーンを一時的に state から外して全体を destroy し、import ブロックで取り込み直す。

## 公開前のチェック

```bash
scripts/secret-scan.sh
```

追跡ファイルと全履歴を、AWS キー、秘密鍵、SSO の Start URL、アカウント ID、Cognito Pool ID のパターンで検索する。`.env.example` のローカル固定値は公開前提の値で、README にその旨を明示している。

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
