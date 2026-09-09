# コンテナセキュリティ

## Dockerfile ハードニング

```dockerfile
# 1. Use specific tags (never :latest)
FROM node:22.12-alpine3.20

# 2. Run as non-root
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
USER app

# 3. Drop capabilities (in compose)
# 4. Read-only root filesystem where possible
# 5. No secrets in image layers
```

## Compose でのセキュリティオプション

```yaml
services:
  app:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
      - /app/.cache
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE          # Only if binding to ports < 1024
```

## シークレット管理

```yaml
# GOOD: Use environment variables (injected at runtime)
services:
  app:
    env_file:
      - .env                     # Never commit .env to git
    environment:
      - API_KEY                  # Inherits from host environment

# GOOD: Docker secrets (Swarm mode)
secrets:
  db_password:
    file: ./secrets/db_password.txt

services:
  db:
    secrets:
      - db_password

# BAD: Hardcoded in image
# ENV API_KEY=sk-proj-xxxxx      # NEVER DO THIS
```

## .dockerignore

ビルドコンテキストを最小化し、機密情報の混入を防ぐ。

```
node_modules
.git
.env
.env.*
dist
coverage
*.log
.next
.cache
docker-compose*.yml
Dockerfile*
README.md
tests/
```

## インストーラ・CLI をコンテナで検証する

使い捨てのプロジェクトコピーに対してインストーラの挙動をテストし、ソースのチェックアウトを変更させない。

プラットフォーム境界を尊重する。

- Debian や Ubuntu などの Linux ディストリビューションは実コンテナで検証する
- Docker は Linux カーネルを共有するため、macOS はコンテナとして実行できない。同じテストエントリポイントを macOS ネイティブで実行する
- Windows コンテナには Windows の Docker エンジンが必要。プラットフォーム非依存のロジックはネイティブの Windows CI ランナーで実行する
- Linux コンテナでの検証をもって macOS や Windows の挙動を検証したと主張しない

隔離の原則を守る。

- ベースイメージは immutable digest でピン留めし、CLI のバージョンも固定する
- リポジトリとソースプロジェクトは read-only でマウントし、変更前に書き込み可能な tmpfs ワークスペースへコピーする
- `read_only: true`、`no-new-privileges:true`、`cap_drop: [ALL]`、有限の `pids_limit` を設定する
- デフォルトのサービスは `network_mode: none` に保ち、ネットワークアクセスは明示的な opt-in サービスに限定する
- ホストの認証情報をデフォルトでコンテナに渡さない
- クロスプラットフォームのランナーには引数配列か `spawnSync(..., { shell: false })` を使い、プロジェクトパスをシェルコマンドに埋め込まない
