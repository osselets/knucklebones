import { z } from 'zod/mini'
import { type IGameState } from '../interfaces'
import { gameStateSchema } from './gameState'

export const GAME_STATE_MESSAGE_VERSION = 1 as const

export type GameStateMessage = IGameState & {
  type: 'game.state'
  version: typeof GAME_STATE_MESSAGE_VERSION
}

export const gameStateMessageSchema = z.extend(gameStateSchema, {
  type: z.literal('game.state'),
  version: z.literal(GAME_STATE_MESSAGE_VERSION)
}) satisfies z.ZodMiniType<GameStateMessage>

export const compatibleGameStateMessageSchema = z.union([
  gameStateMessageSchema,
  gameStateSchema
]) satisfies z.ZodMiniType<IGameState>

export function toGameStateMessage(gameState: IGameState): GameStateMessage {
  return {
    ...gameState,
    type: 'game.state',
    version: GAME_STATE_MESSAGE_VERSION
  }
}
