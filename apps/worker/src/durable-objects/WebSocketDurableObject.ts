import { Toucan } from 'toucan-js'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'

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
    try {
      const url = new URL(request.url)

      switch (url.pathname) {
        case '/websocket': {
          if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response(
              'Expected Upgrade header with webSocket value but found nothing',
              { status: 400 }
            )
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
          return new Response('Not found', { status: 404 })
      }
    } catch (error) {
      this.sentry.captureException(error)
      return new Response('Something went wrong! Team has been notified.', {
        status: 500
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
