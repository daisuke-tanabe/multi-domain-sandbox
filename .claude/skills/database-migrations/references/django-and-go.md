# Django と golang-migrate

## Django（Python）

### ワークフロー

```bash
# モデル変更からマイグレーションを生成
python manage.py makemigrations

# マイグレーションを適用
python manage.py migrate

# マイグレーションステータスを表示
python manage.py showmigrations

# カスタム SQL 用に空のマイグレーションを生成
python manage.py makemigrations --empty app_name -n description
```

### データマイグレーション

```python
from django.db import migrations

def backfill_display_names(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    batch_size = 5000
    users = User.objects.filter(display_name="")
    while users.exists():
        batch = list(users[:batch_size])
        for user in batch:
            user.display_name = user.username
        User.objects.bulk_update(batch, ["display_name"], batch_size=batch_size)

def reverse_backfill(apps, schema_editor):
    pass  # データマイグレーション、逆方向不要

class Migration(migrations.Migration):
    dependencies = [("accounts", "0015_add_display_name")]

    operations = [
        migrations.RunPython(backfill_display_names, reverse_backfill),
    ]
```

### SeparateDatabaseAndState

カラムを Django モデルから削除しつつ、すぐに DB からはドロップしない:

```python
class Migration(migrations.Migration):
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(model_name="user", name="legacy_field"),
            ],
            database_operations=[],  # DB はまだ触らない
        ),
    ]
```

## golang-migrate（Go）

### ワークフロー

```bash
# マイグレーションペアを作成
migrate create -ext sql -dir migrations -seq add_user_avatar

# 保留中のマイグレーションをすべて適用
migrate -path migrations -database "$DATABASE_URL" up

# 最後のマイグレーションをロールバック
migrate -path migrations -database "$DATABASE_URL" down 1

# バージョンを強制（dirty 状態を修正）
migrate -path migrations -database "$DATABASE_URL" force VERSION
```

### マイグレーションファイル

```sql
-- migrations/000003_add_user_avatar.up.sql
ALTER TABLE users ADD COLUMN avatar_url TEXT;
CREATE INDEX CONCURRENTLY idx_users_avatar ON users (avatar_url) WHERE avatar_url IS NOT NULL;

-- migrations/000003_add_user_avatar.down.sql
DROP INDEX IF EXISTS idx_users_avatar;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
```
