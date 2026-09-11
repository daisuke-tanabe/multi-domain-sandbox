# AWS へのデプロイ

## 状態

Terraform は現在のアプリ構成と一致しているが、費用削減のための撤去以降は apply していない。AWS に残っているのは Route 53 ホストゾーンと state バケットだけで、`terraform validate` は通る。
apply すると auth-api / crm-web / crm-api / cms-web / cms-api / provision の ECR リポジトリとタスク定義、常駐 5 アプリの ECS サービスとターゲットグループ、サービスごとのホストを振り分ける ALB、identity / crm / cms の RDS 3 台、Redis、Cognito、Secrets Manager、ACM 証明書、Route 53 レコードが作られる。

## 結論

専用アカウント `multi-domain-sandbox` に、ECS Fargate + ALB、RDS PostgreSQL、ElastiCache Redis、Cognito User Pool を Terraform で作る。
ドメインは `sandbox.daisuke-tanabe.dev` を新アカウントのホストゾーンとして作り、親ゾーンから NS 委任する。
初回は `scripts/tf-bootstrap.sh` → `scripts/deploy.sh --init` → `scripts/delegate-dns.sh` → `scripts/run-provision.sh` の順で実行する。

## 構成

| 要素 | 内容 |
| --- | --- |
| ネットワーク | VPC 10.20.0.0/16。public subnet 2 つに ALB と Fargate タスク、private subnet 2 つに RDS と Redis。NAT なし |
| 実行基盤 | ECS Fargate ARM64。auth-api / crm-web / crm-api / cms-web / cms-api を各 1 タスク。provision は一回限りのタスクでサービスを持たない。サービス一覧は `var.services`、テナント一覧は `var.tenants` で、テナントはリソースを作らず出力の URL にだけ使う |
| ルーティング | ALB のホストベース。`auth.<domain>` → auth-api、`api.<svc>.<domain>` → `<svc>-api`、`*.<svc>.<domain>` → `<svc>-web`。auth を先に、サービスごとに api を web より先に評価する。Route 53 は `auth.<domain>` とサービスごとの `*.<svc>.<domain>` の A エイリアス。`api.<svc>.<domain>` はワイルドカードで解決する |
| 証明書 | ACM。`*.<domain>` に `<domain>` とサービスごとの `*.<svc>.<domain>` を SAN で足し、DNS 検証する。ワイルドカードは 1 階層しか覆わないため |
| DB | RDS PostgreSQL 16、db.t4g.micro、単一 AZ を identity / crm / cms の 3 台。識別子は `multi-domain-sandbox-<name>`、データベース名は `<name>`、マスターは `postgres`。サブネットグループと SG は共有。`rds.force_ssl=1` のため接続 URL に `sslmode=no-verify` を付ける。ロール、スキーマ、シードは provision タスクが 3 台すべてに入れる |
| Session Store | ElastiCache Redis 7、cache.t4g.micro、単一ノード、VPC 内のみ。転送暗号化なしのため `redis://` |
| 認証 | Cognito User Pool。Hosted UI なし。App Client `multi-domain-sandbox-auth-api` は secret 付きで USER_SRP_AUTH のみ許可 |
| 秘密値 | Secrets Manager。`multi-domain-sandbox/db` に `<name>_master_url` `<name>_app_url` `<name>_app_password`、`multi-domain-sandbox/auth-api` に `token_encryption_key` `signing_key_pem` `cognito_client_secret`、`multi-domain-sandbox/services` に provision 用の `json` とサービスごとの `<svc>_client_secret`、`multi-domain-sandbox/seed` に `user_password`。client_secret は記号なし 48 文字の乱数 |
| ログ | CloudWatch Logs。`/ecs/multi-domain-sandbox/<app>` |

ローカルとの差分は環境変数だけで吸収する。Cookie の Secure と `__Host-` プレフィックスは auth-api が `ISSUER` の scheme、`*-web` が `PUBLIC_SCHEME` から導き、切り替え用の変数はない。https にすると本番の値が揃っていることを起動時に検証する。auth-api は `SIGNING_KEY_PEM`、`REDIS_URL`、`COGNITO_ADAPTER=sdk`、`SPA_DIR` が必須で、`*-web` は `REDIS_URL` と https の `ISSUER` / `API_BASE_URL` と `SPA_DIR` が必須。欠けると起動に失敗する。
タスク定義が渡す環境変数は次のとおり。名前はローカルの `.env.example` と同じで、定義は `terraform/ecs.tf` にある。`SPA_DIR` はタスク定義では渡さない。`Dockerfile` が crm-web / cms-web は自分の SPA、auth-api は auth-web を `react-router build` して `/app/spa` に同梱し、`ENV SPA_DIR=/app/spa` を設定する。`*-api` と provision のイメージにも同じ値が入るが読まない。
crm-web / cms-web の `main.ts` は `packages/web-core` の起動関数を呼ぶだけで、crm-api / cms-api の `main.ts` はサービスの定義と routes を `packages/api-core` の起動関数に渡す。環境変数のスキーマは `packages/web-core/src/config.ts` と `packages/api-core/src/config.ts` にある。`*-api` は `PUBLIC_SCHEME` を読まず、aud は `API_BASE_URL` そのものになる。`AUTH_BACKCHANNEL_URL` は AWS では渡さず、公開の `ISSUER` に向けて JWKS と管理 API を呼ぶ。

| アプリ | 変数 | 値 |
| --- | --- | --- |
| auth-api | `PORT` `ISSUER` `TOKEN_ENCRYPTION_KEY_ID` `REDIS_URL` `COGNITO_ADAPTER` `COGNITO_REGION` `COGNITO_USER_POOL_ID` `COGNITO_CLIENT_ID` | `3000` / `https://auth.<domain>` / `tf-1` / `redis://<elasticache>:6379` / `sdk` / Terraform のリージョン、User Pool、App Client の値 |
| auth-api | `DATABASE_URL` `TOKEN_ENCRYPTION_KEY` `SIGNING_KEY_PEM` `COGNITO_CLIENT_SECRET` | Secrets Manager から注入。`DATABASE_URL` は `identity_app_url` で `postgres://sandbox_auth:<password>@<rds>:5432/identity?sslmode=no-verify` |
| crm-web / cms-web | `PORT` `PUBLIC_SCHEME` `ISSUER` `REDIS_URL` `CLIENT_ID` `SERVICE_NAME` `BASE_HOST` `API_BASE_URL` | `3000` / `https` / `https://auth.<domain>` / `redis://<elasticache>:6379` / `crm` または `cms` / `CRM` または `CMS` / `<svc>.<domain>` / `https://api.<svc>.<domain>` |
| crm-web / cms-web | `CLIENT_SECRET` | Secrets Manager の `<svc>_client_secret`。43 文字以上を起動時に検証する |
| crm-api / cms-api | `PORT` `API_BASE_URL` `ISSUER` `CLIENT_ID` | `3000` / `https://api.<svc>.<domain>` / `https://auth.<domain>` / `crm` または `cms`。`API_BASE_URL` がそのまま aud になり、provision が oidc_clients.audience に書く `apiBaseUrl` と同じ値 |
| crm-api / cms-api | `CLIENT_SECRET` `DATABASE_URL` | Secrets Manager から注入。`DATABASE_URL` は `<svc>_app_url` で `postgres://crm_app:<password>@<rds>:5432/crm?sslmode=no-verify` の形。identity DB には接続しない |
| provision | `PUBLIC_SCHEME` `COGNITO_REGION` `COGNITO_USER_POOL_ID` | `https` / Terraform のリージョンと User Pool |
| provision | `DATABASE_URL` `AUTH_DB_PASSWORD` `SERVICES` `SEED_USER_PASSWORD` | Secrets Manager から注入。`DATABASE_URL` は `identity_master_url`、`AUTH_DB_PASSWORD` は `identity_app_password`、`SERVICES` は `multi-domain-sandbox/services` の `json`、`SEED_USER_PASSWORD` は `multi-domain-sandbox/seed` の `user_password` |

`SERVICES` は全サービスの JSON 配列で、Terraform が `locals.tf` で組み立てる。要素は `clientId` `clientSecret` `name` `baseHost` `apiBaseUrl` に加えて、そのサービスの DB のマスター接続 `databaseUrl` と `<clientId>_app` ロールのパスワード `dbPassword` を持つ。`clientSecret` は各 `*-web` / `*-api` の `CLIENT_SECRET`、`dbPassword` は `*-api` の `DATABASE_URL` と同じ値になる。

## 事前準備

- `aws sso login --profile multi-domain-sandbox` が通っていること
- 親ゾーン `daisuke-tanabe.dev` を持つ `daisuke-tanabe` プロファイルもログイン済みであること。NS 委任にだけ使う
- Docker が起動していること。イメージは linux/arm64 でビルドする

## 初回手順

```bash
# 1. state バケット。terraform/backend.hcl も生成される (git 管理外)
scripts/tf-bootstrap.sh
cd terraform && terraform init -backend-config=backend.hcl && cd ..

# 2. ECR を作って 6 つのイメージを push し、全リソースを apply
scripts/deploy.sh --init

# 3. 親ゾーンに NS 委任。ACM の DNS 検証はこの後に通る。委任済みなら不要
PARENT_PROFILE=daisuke-tanabe scripts/delegate-dns.sh

# 4. 委任が伝播したら証明書の検証待ちを含めてもう一度 apply
cd terraform && terraform apply -var image_tag=$(git rev-parse --short HEAD)

# 5. 3 つの RDS のロール、スキーマ、シードと Cognito テストユーザーを投入
scripts/run-provision.sh
```

ホストゾーンは撤去後も残しているため、手順 3 は初めてのときだけ実行する。手順 2 では ACM の検証待ちで apply が止まることがある。その場合は手順 3 を先に実行してから手順 2 を再実行する。

provision は冪等で、`scripts/run-provision.sh` は ECS で一回限りのタスクとして実行し、終了までログを待つ。処理内容は次のとおり。

- identity DB。`sandbox_auth` ロールを `AUTH_DB_PASSWORD` で作るか合わせ、`identity.users` がなければ `db/identity/init/002_identity.sql` を適用する。Cognito にテストユーザーを作り、実際の sub で users を投入し、tenants / tenant_members / oidc_clients / oidc_client_secrets / tenant_services / tenant_service_members を `tools/provision/src/seed-data.ts` から入れる。oidc_clients の redirect_uri_template は `https://{tenant}.<baseHost>/auth/callback`。サービスごとに active な secret を 1 行 upsert し、それ以外の active な secret を revoked にする
- サービスの DB。`SERVICES` の要素ごとに `databaseUrl` へ接続し、`<clientId>_app` ロールを `dbPassword` の NOBYPASSRLS ログインロールとして作るか合わせる。`<clientId>.members` がなければ `db/<clientId>/init/002_schema.sql` を適用し、members が空のときだけ `003_seed.sql` を入れる。`001_roles.sql` はローカル専用の固定パスワードで、RDS では使わない

## テストユーザー

ローカルと同じ alice / bob / carol を Cognito に作る。パスワードは Terraform が生成し Secrets Manager に置く。alice は tanaka の CRM と CMS、suzuki の CRM に入れる。bob は suzuki の CRM に入れる。carol は割り当てなし。サービスごとの役割と権限の上書きは `db/crm/init/003_seed.sql` と `db/cms/init/003_seed.sql` の値がそのまま入る。

```bash
aws secretsmanager get-secret-value --secret-id multi-domain-sandbox/seed \
  --query SecretString --output text | jq -r .user_password
```

## 2 回目以降

```bash
scripts/deploy.sh
```

git の短縮 SHA をイメージタグにして 6 つのイメージを push し、タスク定義を更新する。

## 確認

```bash
cd terraform && terraform output urls
```

`urls` は `portal` に `https://auth.<domain>`、`web` にサービスごとテナントごとの URL、`api` にサービスごとの API の URL、`alb_dns` を返す。web の URL は `https://tanaka.crm.<domain>` のように `var.tenants` の slug で組み立てる。
ブラウザで `https://tanaka.crm.sandbox.daisuke-tanabe.dev/` を開き、alice でログインする。`https://tanaka.cms.sandbox.daisuke-tanabe.dev/` へは SSO で入れる。suzuki は CMS を契約していないため `https://suzuki.cms.sandbox.daisuke-tanabe.dev/` は拒否される。
`SANDBOX_DOMAIN` と `SEED_USER_PASSWORD` を指定すれば smoke と chrome-check を AWS の URL に向けられる。両スクリプトは `<tenant>.<service>.<SANDBOX_DOMAIN>` のホストを前提にする。

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
| Fargate 0.25 vCPU / 0.5 GB × 5 | 約 4,200 円 |
| ALB | 約 3,500 円 + 転送量 |
| RDS db.t4g.micro + 20 GB × 3 | 約 7,500 円 |
| ElastiCache cache.t4g.micro | 約 2,000 円 |
| Route 53 ホストゾーン、Secrets Manager、CloudWatch | 数百円 |

合計で月 2 万円弱。検証が終わったら destroy する。

## 本番へ持ち出すときの差分

- Redis を transit encryption + AUTH 付きにし、`rediss://` で接続する
- RDS を Multi-AZ にし、削除保護と最終スナップショットを有効にする
- Secrets を Terraform の生成値ではなく Secret Store で管理し、state から外す
- RDS の CA 証明書を同梱して `sslmode=verify-full` にする
- NAT Gateway か VPC Endpoint を置き、タスクを private subnet に移す
- ECS のオートスケールと ALB のアクセスログを設定する
