# プルリクエストワークフロー

## PRタイトルのフォーマット

```
<type>(<scope>): <description>

Examples:
feat(auth): add SSO support for enterprise users
fix(api): resolve race condition in order processing
docs(api): add OpenAPI specification for v2 endpoints
```

## PR説明テンプレート

```markdown
## What

Brief description of what this PR does.

## Why

Explain the motivation and context.

## How

Key implementation details worth highlighting.

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Screenshots (if applicable)

Before/after screenshots for UI changes.

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings introduced
- [ ] Tests pass locally
- [ ] Related issues linked

Closes #123
```

## コードレビューチェックリスト

レビュアー向け:

- [ ] コードは記述された問題を解決しているか?
- [ ] ハンドルされていないエッジケースはないか?
- [ ] コードは読みやすく保守可能か?
- [ ] 十分なテストがあるか?
- [ ] セキュリティ上の懸念はないか?
- [ ] コミット履歴は綺麗か（必要ならsquash済みか）?

作成者向け:

- [ ] レビュー依頼前にセルフレビューを完了した
- [ ] CIが通っている（テスト、リント、型チェック）
- [ ] PRのサイズは妥当（理想は<500行）
- [ ] 単一の機能／修正に関連している
- [ ] 説明が変更内容を明確に伝えている
