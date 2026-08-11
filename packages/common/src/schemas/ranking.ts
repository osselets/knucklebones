import { z } from 'zod/mini'
import {
  DEFAULT_RATING_POOL,
  type RankedLeaderboard,
  type RankedProfile
} from '../types'
import { displayNameSchema, playerIdSchema } from './identifiers'

export const rankedProfileSchema = z.object({
  playerId: playerIdSchema,
  displayName: displayNameSchema,
  ratingPool: z.literal(DEFAULT_RATING_POOL),
  rating: z.int(),
  gamesPlayed: z.int().check(z.minimum(0)),
  wins: z.int().check(z.minimum(0)),
  draws: z.int().check(z.minimum(0)),
  losses: z.int().check(z.minimum(0))
}) satisfies z.ZodMiniType<RankedProfile>

const rankedLeaderboardPlayerSchema = z.object({
  playerId: playerIdSchema,
  displayName: displayNameSchema,
  rating: z.int()
})

const rankedLeaderboardEntrySchema = z.extend(rankedLeaderboardPlayerSchema, {
  rank: z.int().check(z.minimum(1))
})

const currentRankedLeaderboardEntrySchema = z.extend(
  rankedLeaderboardPlayerSchema,
  {
    rank: z.nullable(z.int().check(z.minimum(1)))
  }
)

export const rankedLeaderboardSchema = z.object({
  topPlayers: z.array(rankedLeaderboardEntrySchema).check(z.maxLength(10)),
  currentPlayer: currentRankedLeaderboardEntrySchema
}) satisfies z.ZodMiniType<RankedLeaderboard>
