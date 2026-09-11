# AWS へのデプロイ

## 未移行の注意

AWS / Terraform 側はまだ旧構成のままである。旧構成ではテナントごとに OIDC Client を持ち、ホストは `tenant-a.<domain>` / `tenant-b.<domain>`、環境変数は `TENANT_CLIENTS` と `API_AUDIENCE` だった。
アプリと `db/` はサービス × テナントのモデルに移行済みで、ホストは `<tenant>.crm.<domain>` / `<tenant>.cms.<domain>` に変わっている。
さらにアプリはサービスごとに web と api を分けた構成に変わっている。旧構成の auth-server / tenant-web / api-server / provision は auth-api / crm-web / crm-api / cms-web / cms-api / provision になった。`scripts/deploy.sh` と `Dockerfile` は新しいアプリ名でビルドするが、Terraform の ECR リポジトリ名、ECS サービス名、タスク定義、CloudWatch Logs のロググループ名は旧名のままで一致しない。
環境変数も `*-web` の `CLIENT_ID` `CLIENT_SECRET` `SERVICE_NAME` `BASE_HOST` `API_BASE_URL` と `*-api` の `API_BASE_URL` `DATABASE_URL` `CLIENT_ID` `CLIENT_SECRET` に変わっており、旧構成の `TENANT_CLIENTS` と `API_AUDIENCE` はどのアプリも読まない。
DB もサービスごとに分かれた。auth-api は identity DB、crm-api は crm DB、cms-api は cms DB にしか接続せず、3 つのデータベースが必要になる。Terraform は単一の RDS インスタンスに 1 つのデータベースを作る構成のままで、provision タスクは identity DB しか初期化しない。crm / cms の DB は `db/crm/init` と `db/cms/init` の SQL を別途適用する必要があり、その仕組みは未整備。RDS で 3 つのデータベースを作るか、インスタンスを分けるかは移行時に決める。
`*-web` の画面は React Router の SPA になり、本番は `react-router build` の成果物 `build/client` を `SPA_DIR` で BFF に配らせる。auth の画面も `apps/auth-web` の SPA になり、auth-api が `SPA_DIR=../auth-web/build/client` で配る。`Dockerfile` はまだ `react-router build` を実行せず、`pnpm deploy` で展開した `src/main.ts` を起動するだけのため、`*-web` のイメージに SPA が入らず、auth-api のイメージにも auth-web が入らない。auth-api のイメージは `*-web` と同じく auth-web をビルドして成果物を同梱し、`SPA_DIR` を渡す必要がある。`PUBLIC_SCHEME=https` の `*-web` と https の `ISSUER` の auth-api では `SPA_DIR` が必須で、欠けると起動に失敗する。イメージのビルドに SPA のビルドを含める作業も移行に含める。
Terraform の ALB ルーティング、ACM 証明書、ECR / ECS のアプリ名、タスク定義の環境変数、Secrets Manager の client_secret と各 DB ロールのパスワード、3 つのデータベースを現在の構成へ移行する作業は別途行う。それまでこの手順で apply しても現在のアプリは起動しない。以下の Terraform に関する記述は旧構成のものをそのまま残している。

## 結論

専用アカウント `multi-domain-sandbox` に、ECS Fargate + ALB、RDS PostgreSQL、ElastiCache Redis、Cognito User Pool を Terraform で作る。
ドメインは `sandbox.daisuke-tanabe.dev` を新アカウントのホストゾーンとして作り、親ゾーンから NS 委任する。
初回は `scripts/tf-bootstrap.sh` → `scripts/deploy.sh --init` → `scripts/delegate-dns.sh` → `scripts/run-provision.sh` の順で実行する。

## 構成

| 要素 | 内容 |
| --- | --- |
| ネットワーク | VPC 10.20.0.0/16。public subnet 2 つに ALB と Fargate タスク、private subnet 2 つに RDS と Redis。NAT なし |
| 実行基盤 | ECS Fargate ARM64。旧構成の auth-server / tenant-web / api-server を各 1 タスク。provision は一回限りのタスク。移行後は auth-api / crm-web / crm-api / cms-web / cms-api を各 1 タスク |
| ルーティング | ALB のホストベース。旧構成は `auth.<domain>` → auth-server、`api.<domain>` → api-server、`*.<domain>` → tenant-web。移行後は `auth.<domain>` → auth-api、`api.crm.<domain>` → crm-api、`*.crm.<domain>` → crm-web、`api.cms.<domain>` → cms-api、`*.cms.<domain>` → cms-web |
| 証明書 | ACM。`*.<domain>` と `<domain>` を DNS 検証。移行後は `*.crm.<domain>` / `*.cms.<domain>` も必要 |
| DB | RDS PostgreSQL 16、db.t4g.micro、単一 AZ。`rds.force_ssl=1` のため接続 URL に `sslmode=no-verify` を付ける。identity のロールとスキーマは provision タスクが作る。移行後は identity / crm / cms の 3 データベースが必要で、crm / cms の初期化は未整備 |
| Session Store | ElastiCache Redis 7、cache.t4g.micro、単一ノード、VPC 内のみ |
| 認証 | Cognito User Pool。Hosted UI なし。App Client は secret 付きで USER_SRP_AUTH のみ許可 |
| 秘密値 | Secrets Manager。DB パスワード、署名鍵、Token 暗号化鍵、client_secret、テストユーザーのパスワード |
| ログ | CloudWatch Logs。`/ecs/multi-domain-sandbox/<app>` |

ローカルとの差分は環境変数だけで吸収する。Cookie の Secure と `__Host-` プレフィックスは auth-api が `ISSUER` の scheme、`*-web` が `PUBLIC_SCHEME` から導き、切り替え用の変数はない。https にすると本番の値が揃っていることを起動時に検証する。auth-api は `SIGNING_KEY_PEM`、`REDIS_URL`、`COGNITO_ADAPTER=sdk`、`SPA_DIR` が必須で、`*-web` は `REDIS_URL` と https の `ISSUER` / `API_BASE_URL` と `SPA_DIR` が必須。欠けると起動に失敗する。
アプリ側で必要な環境変数は次のとおり。Terraform のタスク定義はまだこれらを渡していない。
crm-web / cms-web の `main.ts` は `packages/web-core` の起動関数を呼ぶだけで、crm-api / cms-api の `main.ts` はサービスの定義と routes を `packages/api-core` の起動関数に渡す。環境変数のスキーマは `packages/web-core/src/config.ts` と `packages/api-core/src/config.ts` にある。`*-api` は `PUBLIC_SCHEME` を読まず、aud は `API_BASE_URL` そのものになる。

| アプリ | 変数 | 本番の値の例 |
| --- | --- | --- |
| auth-api | `ISSUER` `SIGNING_KEY_PEM` `REDIS_URL` `COGNITO_ADAPTER` | `https://auth.<domain>` / Secrets Manager の値 / `rediss://...` / `sdk`。`ISSUER` が https のため 4 つとも必須 |
| auth-api | `DATABASE_URL` | identity DB。`postgres://sandbox_auth:<password>@<rds>/identity?sslmode=no-verify` |
| auth-api | `SPA_DIR` | `../auth-web/build/client`。auth-web の `react-router build` の成果物を auth-api が配る。`ISSUER` が https のため必須で、`SPA_DEV_SERVER_URL` は使わない |
| crm-web | `CLIENT_ID` `CLIENT_SECRET` `SERVICE_NAME` `BASE_HOST` `API_BASE_URL` | `crm` / Secrets Manager の値。43 文字以上 / `CRM` / `crm.<domain>` / `https://api.crm.<domain>` |
| cms-web | 同上 | `cms` / Secrets Manager の値。43 文字以上 / `CMS` / `cms.<domain>` / `https://api.cms.<domain>` |
| crm-web / cms-web | `ISSUER` `REDIS_URL` | `https://auth.<domain>` / `rediss://...`。`PUBLIC_SCHEME` が https のため両方必須 |
| crm-web / cms-web | `SPA_DIR` | `build/client`。`react-router build` の成果物を BFF が配る。`PUBLIC_SCHEME` が https のため必須で、`SPA_DEV_SERVER_URL` は使わない |
| crm-api | `API_BASE_URL` | `https://api.crm.<domain>`。そのまま aud になり、provision が oidc_clients.audience に書く `apiBaseUrl` と同じ値にする |
| cms-api | `API_BASE_URL` | `https://api.cms.<domain>` |
| crm-api / cms-api | `DATABASE_URL` | 自サービスの DB。`postgres://crm_app:<password>@<rds>/crm?sslmode=no-verify` / `postgres://cms_app:<password>@<rds>/cms?sslmode=no-verify`。identity DB には接続しない |
| crm-api / cms-api | `CLIENT_ID` `CLIENT_SECRET` `ISSUER` `AUTH_BACKCHANNEL_URL` | auth-api の管理 API を client_secret_basic で呼ぶための Client 認証。`*-web` と同じ値。`AUTH_BACKCHANNEL_URL` は JWKS と管理 API の内部 URL |
| crm-web / cms-web / provision | `PUBLIC_SCHEME` | `https` |
| provision | `DATABASE_URL` `AUTH_DB_PASSWORD` | identity DB のマスター接続と、`sandbox_auth` ロールに設定するパスワード。auth-api の `DATABASE_URL` と対応させる |
| provision | `SERVICES` | 全サービスの JSON 配列。`[{"clientId":"crm","clientSecret":"<secret>","name":"CRM","baseHost":"crm.<domain>","apiBaseUrl":"https://api.crm.<domain>"},{"clientId":"cms",...}]`。oidc_clients、`https://{tenant}.<baseHost>/auth/callback` の redirect_uri_template、oidc_client_secrets、backchannel_logout_uri の投入に使う。`clientSecret` は 32 バイト以上の乱数で 43 文字以上をスキーマで要求する。サービスごとに active な secret を 1 行 upsert し、それ以外の active な secret を revoked にする。シードはテナント、契約、会社横断の役割 tenant_members、サービスごとの割り当て tenant_service_members を `tools/provision/src/seed-data.ts` から投入する。役割、権限の上書き、業務データは各サービスの DB にあり provision は扱わない |

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

# 5. RDS の identity スキーマ、Cognito テストユーザー、シードを投入
scripts/run-provision.sh
```

provision が扱うのは identity DB だけ。crm / cms の DB は `db/crm/init` と `db/cms/init` の SQL を RDS の別データベースに適用する手順が必要で、未整備。

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

移行後はブラウザで `https://tanaka.crm.sandbox.daisuke-tanabe.dev/` を開き、alice でログインする。
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
| Fargate 0.25 vCPU / 0.5 GB × 3。移行後は × 5 で約 4,200 円 | 約 2,500 円 |
| ALB | 約 3,500 円 + 転送量 |
| RDS db.t4g.micro + 20 GB。移行後は 1 インスタンスに 3 データベースなら同額 | 約 2,500 円 |
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
