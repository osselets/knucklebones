import { z } from 'zod/mini'
import {
  DEFAULT_RATING_POOL,
  type MatchmakingStatus,
  RANKED_MATCH_FORMAT
} from '../types'

const rankedMatchAssignmentSchema = z.object({
  matchId: z.uuidv4(),
  roomKey: z.uuidv4(),
  ratingPool: z.literal(DEFAULT_RATING_POOL),
  format: z.literal(RANKED_MATCH_FORMAT),
  playerOneId: z.uuidv4(),
  playerTwoId: z.uuidv4(),
  createdAt: z.number()
})

export const matchmakingStatusSchema = z.union([
  z.object({ status: z.literal('idle') }),
  z.object({ status: z.literal('waiting'), joinedAt: z.number() }),
  z.object({
    status: z.literal('matched'),
    match: rankedMatchAssignmentSchema
  })
]) satisfies z.ZodMiniType<MatchmakingStatus>
