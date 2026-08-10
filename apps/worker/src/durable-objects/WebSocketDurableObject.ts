import { Toucan } from 'toucan-js'
import {
  credentialIdSchema,
  credentialSchema,
  gameServerEventSchema,
  playerIdSchema,
  presenceUpdateResultSchema,
  PROTOCOL_VERSION,
  roomKeySchema,
  toGameReconnectDeadlineMessage,
  toGamePresenceMessage,
  toGameStateMessage,
  type WebSocketTicket
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { createCredential, hashCredential } from '../utils/credentials'
import { apiError } from '../utils/http'
import { recordOperationalEvent } from '../utils/observability'

const WEB_SOCKET_TICKET_TTL_MS = 30_000
const WEB_SOCKET_TICKETS_STORAGE_KEY = 'websocket-tickets'

interface PendingWebSocketTicket {
  playerId: string
  credentialId: string
  roomKey: string
  protocolVersion: typeof PROTOCOL_VERSION
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
        credentialIdSchema.safeParse(ticket.credentialId).success &&
        roomKeySchema.safeParse(ticket.roomKey).success &&
        ticket.protocolVersion === PROTOCOL_VERSION &&
        Number.isInteger(ticket.expiresAt) &&
        ticket.expiresAt > now
    )
  )
}

interface WebSocketSession {
  playerId: string
  credentialId: string
  roomKey: string
  connectionId: string
  protocolVersion: typeof PROTOCOL_VERSION
  role: 'pending' | 'player' | 'spectator'
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
          const credentialId = request.headers.get('X-Credential-Id')
          const roomKey = request.headers.get('X-Room-Key')

          if (
            request.method !== 'POST' ||
            playerId === null ||
            credentialId === null ||
            roomKey === null
          ) {
            return apiError({
              status: 400,
              code: 'INVALID_WEBSOCKET_TICKET_REQUEST',
              message: 'The WebSocket ticket request is invalid.',
              requestId
            })
          }

          return await this.createTicket(playerId, credentialId, roomKey)
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

          if (event.data.type === 'game.state') {
            this.updateSessionRoles(
              event.data.payload.gameState.playerOne.id,
              event.data.payload.gameState.playerTwo.id
            )
          }
          this.broadcast(JSON.stringify(event.data))
          return new Response(null, { status: 200 })
        }
        case '/disconnect-player': {
          const playerId = request.headers.get('X-Player-Id')
          if (
            request.method !== 'POST' ||
            !playerIdSchema.safeParse(playerId).success
          ) {
            return apiError({
              status: 400,
              code: 'INVALID_PLAYER_DISCONNECT_REQUEST',
              message: 'The player disconnect request is invalid.',
              requestId
            })
          }

          this.disconnectPlayer(playerId!)
          return new Response(null, { status: 204 })
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
    const wasConnected = this.hasOpenSession(session.playerId)
    this.state.acceptWebSocket(webSocket, [`player:${session.playerId}`])
    webSocket.serializeAttachment(session)
    this.sendPresenceSnapshot(webSocket, session.roomKey, webSocket)

    if (!wasConnected) {
      this.broadcast(
        JSON.stringify(
          toGamePresenceMessage(session.roomKey, session.playerId, true)
        )
      )
      await this.reportPresence(session, true)
    }

    recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
      event: 'websocket.connection',
      outcome: 'accepted',
      role: session.role,
      player_connection_count: this.state.getWebSockets(
        `player:${session.playerId}`
      ).length
    })
  }

  async webSocketMessage(webSocket: WebSocket) {
    recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
      event: 'websocket.message',
      outcome: 'rejected',
      reason: 'client-messages-disabled'
    })
    webSocket.close(1008, 'Client messages are not supported.')
  }

  async webSocketClose(
    webSocket: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ) {
    const session = this.readSession(webSocket)
    if (
      session !== undefined &&
      !this.hasOpenSession(session.playerId, webSocket)
    ) {
      this.broadcast(
        JSON.stringify(
          toGamePresenceMessage(session.roomKey, session.playerId, false)
        )
      )
      await this.reportPresence(session, false)
    }

    if (!wasClean) {
      this.sentry.captureMessage(
        `WebSocket closed unexpectedly with code ${code}.`,
        'error'
      )
    }

    recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
      event: 'websocket.connection',
      outcome: 'closed',
      clean: wasClean,
      close_code: code,
      final_player_connection:
        session !== undefined && !this.hasOpenSession(session.playerId)
    })
  }

  async webSocketError(webSocket: WebSocket, error: unknown) {
    this.sentry.captureException(error)
    recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
      event: 'websocket.connection',
      outcome: 'error'
    })
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

  private disconnectPlayer(playerId: string): void {
    this.state.getWebSockets(`player:${playerId}`).forEach((webSocket) => {
      try {
        webSocket.close(1008, 'Ranked match forfeited after three timeouts.')
      } catch (error) {
        this.sentry.captureException(error)
      }
    })
  }

  private async createTicket(
    playerId: string,
    credentialId: string,
    roomKey: string
  ): Promise<Response> {
    if (
      !playerIdSchema.safeParse(playerId).success ||
      !credentialIdSchema.safeParse(credentialId).success ||
      !roomKeySchema.safeParse(roomKey).success
    ) {
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
      activeTickets[ticketHash] = {
        playerId,
        credentialId,
        roomKey,
        protocolVersion: PROTOCOL_VERSION,
        expiresAt
      }
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

      return {
        playerId: pendingTicket.playerId,
        credentialId: pendingTicket.credentialId,
        roomKey: pendingTicket.roomKey,
        connectionId: crypto.randomUUID(),
        protocolVersion: pendingTicket.protocolVersion,
        role: 'pending',
        connectedAt: now
      }
    })
  }

  private hasOpenSession(playerId: string, excluded?: WebSocket): boolean {
    return this.state
      .getWebSockets(`player:${playerId}`)
      .some(
        (webSocket) =>
          webSocket !== excluded && webSocket.readyState === WebSocket.OPEN
      )
  }

  private readSession(webSocket: WebSocket): WebSocketSession | undefined {
    const session = webSocket.deserializeAttachment() as
      Partial<WebSocketSession> | undefined

    if (
      session === undefined ||
      !playerIdSchema.safeParse(session.playerId).success ||
      !credentialIdSchema.safeParse(session.credentialId).success ||
      !roomKeySchema.safeParse(session.roomKey).success ||
      !credentialIdSchema.safeParse(session.connectionId).success ||
      session.protocolVersion !== PROTOCOL_VERSION ||
      !['pending', 'player', 'spectator'].includes(session.role ?? '') ||
      !Number.isInteger(session.connectedAt)
    ) {
      return undefined
    }

    return session as WebSocketSession
  }

  private sendPresenceSnapshot(
    webSocket: WebSocket,
    roomKey: string,
    excluded: WebSocket
  ): void {
    const connectedPlayerIds = new Set<string>()
    this.state.getWebSockets().forEach((connectedWebSocket) => {
      if (
        connectedWebSocket === excluded ||
        connectedWebSocket.readyState !== WebSocket.OPEN
      ) {
        return
      }
      const session = this.readSession(connectedWebSocket)
      if (session !== undefined) {
        connectedPlayerIds.add(session.playerId)
      }
    })

    connectedPlayerIds.forEach((playerId) => {
      webSocket.send(
        JSON.stringify(toGamePresenceMessage(roomKey, playerId, true))
      )
    })
  }

  private updateSessionRoles(playerOneId: string, playerTwoId: string): void {
    this.state.getWebSockets().forEach((webSocket) => {
      const session = this.readSession(webSocket)
      if (session === undefined) {
        return
      }

      session.role =
        session.playerId === playerOneId || session.playerId === playerTwoId
          ? 'player'
          : 'spectator'
      webSocket.serializeAttachment(session)
    })
  }

  private async reportPresence(
    session: WebSocketSession,
    connected: boolean
  ): Promise<void> {
    const id = this.cloudflareEnvironment.GAME_STATE_DURABLE_OBJECT.idFromName(
      session.roomKey
    )
    const gameStateStore =
      this.cloudflareEnvironment.GAME_STATE_DURABLE_OBJECT.get(id)
    const response = await gameStateStore.fetch(
      'https://itty-durable/do/call/updatePresence',
      {
        headers: {
          'do-name': session.roomKey,
          'do-content': JSON.stringify([session.playerId, connected])
        }
      }
    )
    if (!response.ok) {
      throw new Error('The game room rejected a presence update.')
    }

    const result = presenceUpdateResultSchema.parse(await response.json())

    if (result.status === 'updated' && result.reconnectDeadline !== undefined) {
      this.broadcast(
        JSON.stringify(
          toGameReconnectDeadlineMessage(
            session.roomKey,
            session.playerId,
            result.reconnectDeadline
          )
        )
      )
    } else if (result.status === 'adjudicated') {
      this.broadcast(
        JSON.stringify(toGameStateMessage(result.gameState, session.roomKey))
      )
    }
  }
}
