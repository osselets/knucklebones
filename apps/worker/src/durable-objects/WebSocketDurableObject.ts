import { Toucan } from 'toucan-js'
import {
  credentialSchema,
  gameServerEventSchema,
  playerIdSchema,
  type WebSocketTicket
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { createCredential, hashCredential } from '../utils/credentials'
import { apiError } from '../utils/http'

const WEB_SOCKET_TICKET_TTL_MS = 30_000
const WEB_SOCKET_TICKETS_STORAGE_KEY = 'websocket-tickets'

interface PendingWebSocketTicket {
  playerId: string
  expiresAt: number
}

type PendingWebSocketTickets = Record<string, PendingWebSocketTicket>

export function removeExpiredWebSocketTickets(
  tickets: PendingWebSocketTickets,
  now: number
): PendingWebSocketTickets {
  return Object.fromEntries(
    Object.entries(tickets).filter(
      ([ticketHash, ticket]) =>
        credentialSchema.safeParse(ticketHash).success &&
        playerIdSchema.safeParse(ticket.playerId).success &&
        Number.isInteger(ticket.expiresAt) &&
        ticket.expiresAt > now
    )
  )
}

interface WebSocketSession {
  playerId: string
  connectedAt: number
}

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
        case '/ticket': {
          const playerId = request.headers.get('X-Player-Id')

          if (request.method !== 'POST' || playerId === null) {
            return apiError({
              status: 400,
              code: 'INVALID_WEBSOCKET_TICKET_REQUEST',
              message: 'The WebSocket ticket request is invalid.',
              requestId
            })
          }

          return await this.createTicket(playerId)
        }
        case '/websocket': {
          if (request.headers.get('Upgrade') !== 'websocket') {
            return apiError({
              status: 426,
              code: 'WEBSOCKET_UPGRADE_REQUIRED',
              message: 'Expected a WebSocket upgrade request.',
              requestId
            })
          }

          const ticket = url.searchParams.get('ticket')
          const session = await this.consumeTicket(ticket)

          if (session === undefined) {
            return apiError({
              status: 401,
              code: 'INVALID_WEBSOCKET_TICKET',
              message: 'The WebSocket ticket is invalid or expired.',
              requestId
            })
          }

          const [client, server] = Object.values(new WebSocketPair())

          await this.handleSession(server, session)

          return new Response(null, { status: 101, webSocket: client })
        }
        case '/broadcast': {
          const body = await request.json().catch(() => undefined)
          const event = gameServerEventSchema.safeParse(body)
          if (!event.success) {
            return apiError({
              status: 400,
              code: 'INVALID_SERVER_EVENT',
              message: 'The server event is invalid.',
              requestId
            })
          }

          this.broadcast(JSON.stringify(event.data))
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

  async handleSession(webSocket: WebSocket, session: WebSocketSession) {
    this.state.acceptWebSocket(webSocket, [`player:${session.playerId}`])
    webSocket.serializeAttachment(session)
  }

  async webSocketMessage(webSocket: WebSocket) {
    webSocket.close(1008, 'Client messages are not supported.')
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

  private async createTicket(playerId: string): Promise<Response> {
    if (!playerIdSchema.safeParse(playerId).success) {
      throw new Error('Cannot issue a WebSocket ticket for an invalid player.')
    }

    const ticket = createCredential()
    const ticketHash = await hashCredential(ticket)
    const now = Date.now()
    const expiresAt = now + WEB_SOCKET_TICKET_TTL_MS

    await this.state.storage.transaction(async (transaction) => {
      const tickets = await transaction.get<PendingWebSocketTickets>(
        WEB_SOCKET_TICKETS_STORAGE_KEY
      )
      const activeTickets = removeExpiredWebSocketTickets(tickets ?? {}, now)
      activeTickets[ticketHash] = { playerId, expiresAt }
      await transaction.put(WEB_SOCKET_TICKETS_STORAGE_KEY, activeTickets)
    })

    return Response.json({ ticket, expiresAt } satisfies WebSocketTicket, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' }
    })
  }

  private async consumeTicket(
    ticket: string | null
  ): Promise<WebSocketSession | undefined> {
    const parsedTicket = credentialSchema.safeParse(ticket)
    if (!parsedTicket.success) {
      return undefined
    }

    const ticketHash = await hashCredential(parsedTicket.data)
    const now = Date.now()

    return await this.state.storage.transaction(async (transaction) => {
      const tickets = await transaction.get<PendingWebSocketTickets>(
        WEB_SOCKET_TICKETS_STORAGE_KEY
      )
      const activeTickets = removeExpiredWebSocketTickets(tickets ?? {}, now)
      const pendingTicket = activeTickets[ticketHash]

      delete activeTickets[ticketHash]

      if (Object.keys(activeTickets).length === 0) {
        await transaction.delete(WEB_SOCKET_TICKETS_STORAGE_KEY)
      } else {
        await transaction.put(WEB_SOCKET_TICKETS_STORAGE_KEY, activeTickets)
      }

      if (pendingTicket === undefined) {
        return undefined
      }

      return { playerId: pendingTicket.playerId, connectedAt: now }
    })
  }
}
