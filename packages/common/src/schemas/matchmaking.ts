import { z } from 'zod/mini'
import {
  DEFAULT_RATING_POOL,
  type MatchmakingPopulation,
  type MatchmakingStatus,
  RANKED_MATCH_FORMAT,
  RANKED_QUEUE_KEY,
  type RankedMatchSettlement,
  type RankedMatchSettlementResult,
  type RankedRematchStatus
} from '../types'
import { gameFinishReasonSchema } from './gameState'
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

export const matchmakingPopulationSchema = z.object({
  queuedPlayers: z.int().check(z.minimum(0)),
  activePlayers: z.int().check(z.minimum(0))
}) satisfies z.ZodMiniType<MatchmakingPopulation>

export const matchmakingStatusSchema = z.union([
  z.object({ status: z.literal('idle') }),
  z.object({
    status: z.literal('waiting'),
    joinedAt: z.int().check(z.minimum(0)),
    population: z.optional(matchmakingPopulationSchema)
  }),
  z.object({
    status: z.literal('match-found'),
    match: rankedMatchAssignmentSchema,
    acceptBy: z.int().check(z.minimum(0)),
    accepted: z.boolean()
  }),
  z.object({
    status: z.literal('matched'),
    match: rankedMatchAssignmentSchema
  })
]) satisfies z.ZodMiniType<MatchmakingStatus>

const eloRatingChangeSchema = z.object({
  before: z.int(),
  after: z.int(),
  change: z.int()
})

export const rankedMatchSettlementSchema = z.object({
  matchId: matchIdSchema,
  roomKey: roomKeySchema,
  queueKey: z.literal(RANKED_QUEUE_KEY),
  ratingPool: z.literal(DEFAULT_RATING_POOL),
  format: z.literal(RANKED_MATCH_FORMAT),
  playerOneId: playerIdSchema,
  playerTwoId: playerIdSchema,
  result: z.enum(['player-one-win', 'draw', 'player-two-win', 'no-contest']),
  finishReason: gameFinishReasonSchema,
  playerOne: eloRatingChangeSchema,
  playerTwo: eloRatingChangeSchema,
  settledAt: z.int().check(z.minimum(0))
}) satisfies z.ZodMiniType<RankedMatchSettlement>

export const rankedMatchSettlementResultSchema = z.union([
  z.object({ status: z.enum(['not-ranked', 'not-finished']) }),
  z.object({
    status: z.enum(['settled', 'already-settled']),
    settlement: rankedMatchSettlementSchema
  })
]) satisfies z.ZodMiniType<RankedMatchSettlementResult>

export const rankedRematchStatusSchema = z.union([
  z.object({ status: z.enum(['waiting', 'opponent-unavailable']) }),
  z.object({
    status: z.literal('matched'),
    match: rankedMatchAssignmentSchema
  })
]) satisfies z.ZodMiniType<RankedRematchStatus>
