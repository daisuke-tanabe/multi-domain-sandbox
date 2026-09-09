# バージョニング

## URL パスバージョニング（推奨）

```
/api/v1/users
/api/v2/users
```

長所: 明示的、ルーティングが容易、キャッシュ可能
短所: バージョン間で URL が変わる

## ヘッダーバージョニング

```
GET /api/users
Accept: application/vnd.myapp.v2+json
```

長所: クリーンな URL
短所: テストしにくい、忘れやすい

## バージョニング戦略

```
1. Start with /api/v1/ — don't version until you need to
2. Maintain at most 2 active versions (current + previous)
3. Deprecation timeline:
   - Announce deprecation (6 months notice for public APIs)
   - Add Sunset header: Sunset: Sat, 01 Jan 2026 00:00:00 GMT
   - Return 410 Gone after sunset date
4. Non-breaking changes don't need a new version:
   - Adding new fields to responses
   - Adding new optional query parameters
   - Adding new endpoints
5. Breaking changes require a new version:
   - Removing or renaming fields
   - Changing field types
   - Changing URL structure
   - Changing authentication method
```
