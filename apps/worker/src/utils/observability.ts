import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'

type OperationalValue = string | number | boolean | undefined

interface OperationalEvent {
  event: string
  [key: string]: OperationalValue
}

interface HttpRequestEventOptions {
  request: Request
  response: Response
  requestId: string
  environment: CloudflareEnvironment['ENVIRONMENT']
  startedAt: number
}

export function recordHttpRequest({
  request,
  response,
  requestId,
  environment,
  startedAt
}: HttpRequestEventOptions): void {
  recordOperationalEvent(environment, {
    event: 'http.request',
    request_id: requestId,
    method: request.method,
    route: classifyRoute(new URL(request.url).pathname),
    status: response.status,
    duration_ms: Math.max(0, Date.now() - startedAt),
    error_code: response.headers.get('X-Knucklebones-Error-Code') ?? undefined
  })
}

export function recordOperationalEvent(
  environment: CloudflareEnvironment['ENVIRONMENT'],
  event: OperationalEvent
): void {
  if (environment === 'development') {
    return
  }

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      environment,
      ...event
    })
  )
}

export function classifyRoute(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)

  if (segments[0] === 'v1' && segments[1] === 'rooms') {
    return ['/v1/rooms/:roomKey', ...segments.slice(3)].join('/')
  }

  if (segments[0] === 'v1' && segments[1] === 'identity') {
    if (segments[2] === 'credentials' && segments.length > 3) {
      return '/v1/identity/credentials/:credentialId'
    }
    return `/${segments.join('/')}`
  }

  if (segments[0] === 'players' || segments[0] === 'matchmaking') {
    if (segments.length === 1) {
      return `/${segments[0]}`
    }
    return [`/${segments[0]}/:playerId`, ...segments.slice(2)].join('/')
  }

  if (segments.length === 2 && segments[1] === 'websocket') {
    return '/:roomKey/websocket'
  }

  if (segments.length >= 3) {
    return ['/:roomKey/:playerId', ...segments.slice(2, 3)].join('/')
  }

  return '/unmatched'
}
