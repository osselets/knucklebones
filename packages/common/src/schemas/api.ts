import { z } from 'zod/mini'
import { type ApiErrorBody, type ClientProtocolDiagnostic } from '../types'
import { boTypeSchema, difficultySchema } from './gameState'
import {
  displayNameSchema,
  playerIdSchema,
  requestIdSchema,
  roomKeySchema
} from './identifiers'

export const apiErrorDetailsSchema = z.object({
  code: z.string().check(z.minLength(1)),
  message: z.string().check(z.minLength(1)),
  requestId: requestIdSchema,
  retryable: z.boolean()
})

export const apiErrorBodySchema = z.object({
  error: apiErrorDetailsSchema
}) satisfies z.ZodMiniType<ApiErrorBody>

export const clientProtocolDiagnosticSchema = z.strictObject({
  code: z.enum(['INVALID_GAME_STATE_MESSAGE', 'UNSUPPORTED_PROTOCOL_VERSION'])
}) satisfies z.ZodMiniType<ClientProtocolDiagnostic>

export const playerRouteParamsSchema = z.object({
  playerId: playerIdSchema
})

export const roomRouteParamsSchema = z.object({
  roomKey: roomKeySchema,
  playerId: playerIdSchema
})

export const playRouteParamsSchema = z.object({
  roomKey: roomKeySchema,
  playerId: playerIdSchema,
  column: z.enum(['0', '1', '2']),
  dice: z.enum(['1', '2', '3', '4', '5', '6'])
})

export const playIntentSchema = z.strictObject({
  column: z.union([z.literal(0), z.literal(1), z.literal(2)])
})

export const initializeRoomSchema = z.union([
  z.strictObject({
    playerType: z.literal('human'),
    boType: z.optional(boTypeSchema)
  }),
  z.strictObject({
    playerType: z.literal('ai'),
    difficulty: difficultySchema,
    boType: z.optional(boTypeSchema)
  })
])

export const rematchRoomSchema = z.strictObject({
  boType: z.optional(boTypeSchema),
  difficulty: z.optional(difficultySchema)
})

export const updateDisplayNameSchema = z.strictObject({
  displayName: displayNameSchema
})

export const gameSettingsQuerySchema = z.object({
  boType: z.optional(z.enum(['indefinite', '1', '3', '5'])),
  difficulty: z.optional(z.enum(['easy', 'medium', 'hard']))
})

export const initGameQuerySchema = gameSettingsQuerySchema
