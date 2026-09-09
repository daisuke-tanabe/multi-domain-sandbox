# バックグラウンドジョブとロギング

## バックグラウンドジョブ（シンプルなインメモリキュー）

リクエスト処理から重い処理を切り離す。プロセス再起動で失われるため、永続キュー（BullMQ、SQS など）への置換を前提に小さく始める。

```typescript
class JobQueue<T> {
  private queue: T[] = []
  private processing = false

  async add(job: T): Promise<void> {
    this.queue.push(job)

    if (!this.processing) {
      this.process()
    }
  }

  private async process(): Promise<void> {
    this.processing = true

    while (this.queue.length > 0) {
      const job = this.queue.shift()!

      try {
        await this.execute(job)
      } catch (error) {
        console.error('Job failed:', error)
      }
    }

    this.processing = false
  }

  private async execute(job: T): Promise<void> {
    // Job execution logic
  }
}

// Usage for indexing items
interface IndexJob {
  itemId: string
}

const indexQueue = new JobQueue<IndexJob>()

export async function POST(request: Request) {
  const { itemId } = await request.json()

  // Add to queue instead of blocking
  await indexQueue.add({ itemId })

  return NextResponse.json({ success: true, message: 'Job queued' })
}
```

## 構造化ロギング

JSON 形式で 1 行 1 ログを吐き、ログ集約基盤（Datadog / CloudWatch / Loki 等）でクエリ可能にする。`requestId` を全ログに通すと追跡が効く。

```typescript
interface LogContext {
  userId?: string
  requestId?: string
  method?: string
  path?: string
  [key: string]: unknown
}

class Logger {
  log(level: 'info' | 'warn' | 'error', message: string, context?: LogContext) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    }

    console.log(JSON.stringify(entry))
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context)
  }

  error(message: string, error: Error, context?: LogContext) {
    this.log('error', message, {
      ...context,
      error: error.message,
      stack: error.stack
    })
  }
}

const logger = new Logger()

// Usage
export async function GET(request: Request) {
  const requestId = crypto.randomUUID()

  logger.info('Fetching items', {
    requestId,
    method: 'GET',
    path: '/api/items'
  })

  try {
    const items = await fetchItems()
    return NextResponse.json({ success: true, data: items })
  } catch (error) {
    logger.error('Failed to fetch items', error as Error, { requestId })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```
