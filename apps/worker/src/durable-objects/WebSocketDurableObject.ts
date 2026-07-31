import { Toucan } from 'toucan-js'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { apiError } from '../utils/http'

export class WebSocketDurableObject {
  state: DurableObjectState
  cloudflareEnvironment: CloudflareEnvironment
  sentry: Toucan

  constructor(
    state: DurableObjectState,
    cloudflareEnvironment: CloudflareEnvironment
  ) {
    this.state = state
    this.cloudflareEnvironment = cloudflareEnvironment
    this.sentry = new Toucan({
      dsn: this.cloudflareEnvironment.SENTRY_DSN,
      context: this.state
    })
  }

  async fetch(request: Request) {
    const requestId = request.headers.get('X-Request-Id') ?? crypto.randomUUID()

    try {
      const url = new URL(request.url)

      switch (url.pathname) {
        case '/websocket': {
          if (request.headers.get('Upgrade') !== 'websocket') {
            return apiError({
              status: 426,
              code: 'WEBSOCKET_UPGRADE_REQUIRED',
              message: 'Expected a WebSocket upgrade request.',
              requestId
            })
          }

          const [client, server] = Object.values(new WebSocketPair())

          await this.handleSession(server)

          return new Response(null, { status: 101, webSocket: client })
        }
        case '/broadcast': {
          this.broadcast(await request.text())
          return new Response(null, { status: 200 })
        }
        default:
          return apiError({
            status: 404,
            code: 'NOT_FOUND',
            message: 'The requested resource was not found.',
            requestId
          })
      }
    } catch (error) {
      this.sentry.setTag('request_id', requestId)
      this.sentry.captureException(error)
      return apiError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. The team has been notified.',
        requestId,
        retryable: true
      })
    }
  }

  async handleSession(webSocket: WebSocket) {
    this.state.acceptWebSocket(webSocket)
  }

  async webSocketMessage(webSocket: WebSocket, message: string | ArrayBuffer) {
    try {
      this.broadcast(JSON.stringify(message))
    } catch (error) {
      this.sentry.captureException(error)
    }
  }

  async webSocketClose(
    webSocket: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ) {
    if (!wasClean) {
      this.sentry.captureMessage(`${code} - ${reason}`, 'error')
    }
  }

  async webSocketError(webSocket: WebSocket, error: unknown) {
    this.sentry.captureException(error)
  }

  broadcast(message: string) {
    this.state.getWebSockets().forEach((webSocket) => {
      try {
        webSocket.send(message)
      } catch (error) {
        this.sentry.captureException(error)
      }
    })
  }
}
