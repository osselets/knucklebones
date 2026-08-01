import { z } from 'zod/mini'
import {
  type GameStateMutationResult,
  type IdempotentMutationResult,
  type InitializeGameResult,
  type PlayGameResult,
  type PresenceUpdateResult,
  type RematchGameResult,
  type UpdateDisplayNameResult
} from '../types'
import { gameStateSchema } from './gameState'
import { boTypeSchema, difficultySchema } from './gameState'
import {
  displayNameSchema,
  gamePlayerIdSchema,
  mutationIdSchema,
  playerIdSchema
} from './identifiers'

const gameSettingsCommandSchema = z.object({
  boType: z.optional(boTypeSchema),
  difficulty: z.optional(difficultySchema)
})

export const initializeGameCommandSchema = z.object({
  mutationId: mutationIdSchema,
  playerId: gamePlayerIdSchema,
  displayName: z.optional(displayNameSchema),
  difficulty: z.optional(difficultySchema),
  boType: z.optional(boTypeSchema)
})

export const playGameCommandSchema = z.object({
  mutationId: mutationIdSchema,
  actorId: gamePlayerIdSchema,
  column: z.int().check(z.minimum(0), z.maximum(2)),
  expectedRevision: z.optional(z.int().check(z.minimum(0)))
})

export const rematchGameCommandSchema = z.object({
  mutationId: mutationIdSchema,
  playerId: playerIdSchema,
  gameSettings: z.optional(gameSettingsCommandSchema)
})

export const updateDisplayNameCommandSchema = z.object({
  mutationId: mutationIdSchema,
  playerId: playerIdSchema,
  displayName: z.optional(displayNameSchema)
})

const updatedGameStateResultSchema = z.object({
  status: z.literal('updated'),
  gameState: gameStateSchema
})

export const initializeGameResultSchema = z.union([
  z.object({
    status: z.enum(['waiting', 'not-assigned', 'invalid-ranked-settings'])
  }),
  z.object({
    status: z.enum(['created', 'existing']),
    gameState: gameStateSchema
  })
]) satisfies z.ZodMiniType<InitializeGameResult>

export const rematchGameResultSchema = z.union([
  z.object({
    status: z.enum([
      'game-ongoing',
      'unchanged',
      'unknown-player',
      'ranked-rematch-disabled'
    ])
  }),
  updatedGameStateResultSchema
]) satisfies z.ZodMiniType<RematchGameResult>

export const updateDisplayNameResultSchema = z.union([
  z.object({ status: z.literal('unknown-player') }),
  updatedGameStateResultSchema
]) satisfies z.ZodMiniType<UpdateDisplayNameResult>

export const playGameResultSchema = z.union([
  z.object({
    status: z.literal('rejected'),
    reason: z.enum([
      'game-not-initialized',
      'game-ended',
      'unknown-player',
      'not-player-turn',
      'invalid-column',
      'column-full',
      'invalid-game-state',
      'stale-revision'
    ])
  }),
  updatedGameStateResultSchema
]) satisfies z.ZodMiniType<PlayGameResult>

export const presenceUpdateResultSchema = z.union([
  z.object({ status: z.enum(['disabled', 'ignored', 'unchanged']) }),
  z.object({
    status: z.literal('updated'),
    playerId: playerIdSchema,
    connected: z.boolean(),
    reconnectDeadline: z.optional(z.int().check(z.minimum(0)))
  }),
  z.object({
    status: z.literal('adjudicated'),
    gameState: gameStateSchema
  })
]) satisfies z.ZodMiniType<PresenceUpdateResult>

export const gameStateMutationResultSchema = z.union([
  initializeGameResultSchema,
  rematchGameResultSchema,
  updateDisplayNameResultSchema,
  playGameResultSchema
]) satisfies z.ZodMiniType<GameStateMutationResult>

function idempotentResultSchema<T>(valueSchema: z.ZodMiniType<T>) {
  return z.union([
    z.object({ idempotencyStatus: z.literal('conflict') }),
    z.object({
      idempotencyStatus: z.enum(['applied', 'replayed']),
      value: valueSchema
    })
  ]) satisfies z.ZodMiniType<IdempotentMutationResult<T>>
}

export const idempotentInitializeGameResultSchema = idempotentResultSchema(
  initializeGameResultSchema
)
export const idempotentRematchGameResultSchema = idempotentResultSchema(
  rematchGameResultSchema
)
export const idempotentUpdateDisplayNameResultSchema = idempotentResultSchema(
  updateDisplayNameResultSchema
)
export const idempotentPlayGameResultSchema =
  idempotentResultSchema(playGameResultSchema)
