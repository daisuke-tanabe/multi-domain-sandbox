# ネットワーキングとボリューム戦略

## サービスディスカバリ

同じ Compose ネットワーク上のサービスはサービス名で名前解決される。

```
# From "app" container:
postgres://postgres:postgres@db:5432/app_dev    # "db" resolves to the db container
redis://redis:6379/0                             # "redis" resolves to the redis container
```

## カスタムネットワーク

ネットワークを分けることで、フロントエンドからは API のみ見えて DB は見えない、といった分離を実現できる。

```yaml
services:
  frontend:
    networks:
      - frontend-net

  api:
    networks:
      - frontend-net
      - backend-net

  db:
    networks:
      - backend-net              # Only reachable from api, not frontend

networks:
  frontend-net:
  backend-net:
```

## ポート公開のスコープ

```yaml
services:
  db:
    ports:
      - "127.0.0.1:5432:5432"   # Only accessible from host, not network
    # Omit ports entirely in production -- accessible only within Docker network
```

## ボリュームの 3 種類

```yaml
volumes:
  # Named volume: persists across container restarts, managed by Docker
  pgdata:

  # Bind mount: maps host directory into container (for development)
  # - ./src:/app/src

  # Anonymous volume: preserves container-generated content from bind mount override
  # - /app/node_modules
```

## よくあるパターン

```yaml
services:
  app:
    volumes:
      - .:/app                   # Source code (bind mount for hot reload)
      - /app/node_modules        # Protect container's node_modules from host
      - /app/.next               # Protect build cache

  db:
    volumes:
      - pgdata:/var/lib/postgresql/data          # Persistent data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql  # Init scripts
```

選び方:
- Named volume: 永続化が必要なデータ（DB / Redis 等）
- Bind mount: 開発時のホットリロード（`./src:/app/src`）
- Anonymous volume: bind mount で上書きされたくないコンテナ内ディレクトリ（`/app/node_modules` 等）
