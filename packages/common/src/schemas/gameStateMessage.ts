import { z } from 'zod/mini'
import { type IGameState } from '../interfaces'
import {
  type ApiErrorDetails,
  type GameErrorEvent,
  type GamePresenceEvent,
  type GameReconnectDeadlineEvent,
  type GameServerEvent,
  type GameStateEvent,
  PROTOCOL_VERSION
} from '../types'
import { apiErrorDetailsSchema } from './api'
import { gameStateSchema } from './gameState'
import { playerIdSchema, requestIdSchema, roomKeySchema } from './identifiers'

export const GAME_STATE_MESSAGE_VERSION = PROTOCOL_VERSION

const eventMetadata = {
  version: z.literal(PROTOCOL_VERSION),
  requestId: z.optional(requestIdSchema)
}

export const gameStateMessageSchema = z.object({
  ...eventMetadata,
  type: z.literal('game.state'),
  payload: z.object({
    roomKey: roomKeySchema,
    gameState: gameStateSchema
  })
}) satisfies z.ZodMiniType<GameStateEvent>

export const gameErrorMessageSchema = z.object({
  ...eventMetadata,
  type: z.literal('game.error'),
  payload: apiErrorDetailsSchema
}) satisfies z.ZodMiniType<GameErrorEvent>

export const gamePresenceMessageSchema = z.object({
  ...eventMetadata,
  type: z.literal('game.presence'),
  payload: z.object({
    roomKey: roomKeySchema,
    playerId: playerIdSchema,
    connected: z.boolean()
  })
}) satisfies z.ZodMiniType<GamePresenceEvent>

export const gameReconnectDeadlineMessageSchema = z.object({
  ...eventMetadata,
  type: z.literal('game.reconnect-deadline'),
  payload: z.object({
    roomKey: roomKeySchema,
    playerId: playerIdSchema,
    expiresAt: z.int().check(z.minimum(0))
  })
}) satisfies z.ZodMiniType<GameReconnectDeadlineEvent>

export const gameServerEventSchema = z.union([
  gameStateMessageSchema,
  gameErrorMessageSchema,
  gamePresenceMessageSchema,
  gameReconnectDeadlineMessageSchema
]) satisfies z.ZodMiniType<GameServerEvent>

type LegacyVersionedGameStateMessage = IGameState & {
  roomKey: string
  type: 'game.state'
  version: typeof PROTOCOL_VERSION
}

const legacyVersionedGameStateMessageSchema = z.extend(gameStateSchema, {
  roomKey: z.string().check(z.minLength(1)),
  type: z.literal('game.state'),
  version: z.literal(PROTOCOL_VERSION)
}) satisfies z.ZodMiniType<LegacyVersionedGameStateMessage>

export const compatibleGameStateMessageSchema = z.union([
  gameStateMessageSchema,
  legacyVersionedGameStateMessageSchema,
  gameStateSchema
])

export type CompatibleGameStateMessage = z.infer<
  typeof compatibleGameStateMessageSchema
>

export function getGameStateMessagePayload(
  message: CompatibleGameStateMessage
) {
  if ('payload' in message) {
    return message.payload
  }

  return {
    roomKey: 'roomKey' in message ? message.roomKey : undefined,
    gameState: message
  }
}

export function toGameStateMessage(
  gameState: IGameState,
  roomKey: string,
  requestId?: string
): GameStateEvent {
  return {
    version: PROTOCOL_VERSION,
    type: 'game.state',
    ...(requestId !== undefined && { requestId }),
    payload: { roomKey, gameState }
  }
}

export function toGameErrorMessage(payload: ApiErrorDetails): GameErrorEvent {
  return {
    version: PROTOCOL_VERSION,
    type: 'game.error',
    requestId: payload.requestId,
    payload
  }
}

export function toGamePresenceMessage(
  roomKey: string,
  playerId: string,
  connected: boolean,
  requestId?: string
): GamePresenceEvent {
  return {
    version: PROTOCOL_VERSION,
    type: 'game.presence',
    ...(requestId !== undefined && { requestId }),
    payload: { roomKey, playerId, connected }
  }
}

export function toGameReconnectDeadlineMessage(
  roomKey: string,
  playerId: string,
  expiresAt: number,
  requestId?: string
): GameReconnectDeadlineEvent {
  return {
    version: PROTOCOL_VERSION,
    type: 'game.reconnect-deadline',
    ...(requestId !== undefined && { requestId }),
    payload: { roomKey, playerId, expiresAt }
  }
}
