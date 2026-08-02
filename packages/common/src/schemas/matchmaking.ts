import { z } from 'zod/mini'
import {
  DEFAULT_RATING_POOL,
  type MatchmakingStatus,
  RANKED_MATCH_FORMAT,
  RANKED_QUEUE_KEY
} from '../types'
import { matchIdSchema, playerIdSchema, roomKeySchema } from './identifiers'

export const rankedMatchAssignmentSchema = z.object({
  matchId: matchIdSchema,
  roomKey: roomKeySchema,
  queueKey: z.literal(RANKED_QUEUE_KEY),
  ratingPool: z.literal(DEFAULT_RATING_POOL),
  format: z.literal(RANKED_MATCH_FORMAT),
  playerOneId: playerIdSchema,
  playerTwoId: playerIdSchema,
  playerOneRating: z.int(),
  playerTwoRating: z.int(),
  createdAt: z.int().check(z.minimum(0)),
  expiresAt: z.int().check(z.minimum(0))
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
