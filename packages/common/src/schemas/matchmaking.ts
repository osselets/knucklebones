import { z } from 'zod/mini'
import {
  DEFAULT_RATING_POOL,
  type MatchmakingStatus,
  RANKED_MATCH_FORMAT
} from '../types'
import { matchIdSchema, playerIdSchema, roomKeySchema } from './identifiers'

export const rankedMatchAssignmentSchema = z.object({
  matchId: matchIdSchema,
  roomKey: roomKeySchema,
  ratingPool: z.literal(DEFAULT_RATING_POOL),
  format: z.literal(RANKED_MATCH_FORMAT),
  playerOneId: playerIdSchema,
  playerTwoId: playerIdSchema,
  createdAt: z.int().check(z.minimum(0))
})

export const matchmakingStatusSchema = z.union([
  z.object({ status: z.literal('idle') }),
  z.object({
    status: z.literal('waiting'),
    joinedAt: z.int().check(z.minimum(0))
  }),
  z.object({
    status: z.literal('matched'),
    match: rankedMatchAssignmentSchema
  })
]) satisfies z.ZodMiniType<MatchmakingStatus>
