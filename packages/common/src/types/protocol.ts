import { type IGameState } from '../interfaces'

export const PROTOCOL_VERSION = 1 as const

export interface ServerEvent<TType extends string, TPayload> {
  version: typeof PROTOCOL_VERSION
  type: TType
  requestId?: string
  payload: TPayload
}

export interface ApiErrorDetails {
  code: string
  message: string
  requestId: string
  retryable: boolean
}

export interface ApiErrorBody {
  error: ApiErrorDetails
}

export type ClientProtocolDiagnosticCode =
  'INVALID_GAME_STATE_MESSAGE' | 'UNSUPPORTED_PROTOCOL_VERSION'

export interface ClientProtocolDiagnostic {
  code: ClientProtocolDiagnosticCode
}

export interface GameStateEventPayload {
  roomKey: string
  gameState: IGameState
}

export type GameStateEvent = ServerEvent<'game.state', GameStateEventPayload>

export type GameErrorEvent = ServerEvent<'game.error', ApiErrorDetails>

export interface GamePresenceEventPayload {
  roomKey: string
  playerId: string
  connected: boolean
}

export type GamePresenceEvent = ServerEvent<
  'game.presence',
  GamePresenceEventPayload
>

export interface GameReconnectDeadlineEventPayload {
  roomKey: string
  playerId: string
  expiresAt: number
}

export type GameReconnectDeadlineEvent = ServerEvent<
  'game.reconnect-deadline',
  GameReconnectDeadlineEventPayload
>

export type GameServerEvent =
  | GameStateEvent
  | GameErrorEvent
  | GamePresenceEvent
  | GameReconnectDeadlineEvent
