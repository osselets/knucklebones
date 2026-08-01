import { type RequestWithId } from '../types/itty'
import { hashCredential } from './credentials'
import { apiError } from './http'

interface RateLimitOptions {
  scope: string
  limit: number
  windowMs: number
  identifier?: string
}

interface RateLimitBucketRow {
  window_started_at: number
  request_count: number
}

export async function enforceRateLimit(
  request: Request & RequestWithId,
  database: D1Database,
  { scope, limit, windowMs, identifier }: RateLimitOptions
): Promise<Response | undefined> {
  const now = Date.now()
  const windowCutoff = now - windowMs
  const connectingIp = request.headers.get('CF-Connecting-IP')
  if (
    identifier === undefined &&
    (connectingIp === null ||
      connectingIp === '127.0.0.1' ||
      connectingIp === '::1')
  ) {
    return
  }

  const clientIdentifier = identifier ?? connectingIp!
  const bucketKey = await hashCredential(`${scope}:${clientIdentifier}`)
  const bucket = await database
    .prepare(
      `INSERT INTO rate_limit_buckets
        (bucket_key, window_started_at, request_count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET
         window_started_at = CASE
           WHEN rate_limit_buckets.window_started_at <= ?
           THEN excluded.window_started_at
           ELSE rate_limit_buckets.window_started_at
         END,
         request_count = CASE
           WHEN rate_limit_buckets.window_started_at <= ? THEN 1
           ELSE rate_limit_buckets.request_count + 1
         END,
         updated_at = excluded.updated_at
       RETURNING window_started_at, request_count`
    )
    .bind(bucketKey, now, now, windowCutoff, windowCutoff)
    .first<RateLimitBucketRow>()

  if (bucket === null || bucket.request_count <= limit) {
    return
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.window_started_at + windowMs - now) / 1000)
  )
  const response = apiError({
    status: 429,
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
    requestId: request.requestId,
    retryable: true
  })
  response.headers.set('Retry-After', String(retryAfterSeconds))
  return response
}
