import { z } from 'zod/mini'
import {
  DEFAULT_RATING_POOL,
  type RankedAvailability,
  type RankedProfile
} from '../types'
import { playerIdSchema } from './identifiers'

export const rankedProfileSchema = z.object({
  playerId: playerIdSchema,
  ratingPool: z.literal(DEFAULT_RATING_POOL),
  rating: z.int(),
  gamesPlayed: z.int().check(z.minimum(0)),
  wins: z.int().check(z.minimum(0)),
  draws: z.int().check(z.minimum(0)),
  losses: z.int().check(z.minimum(0))
}) satisfies z.ZodMiniType<RankedProfile>

export const rankedAvailabilitySchema = z.object({
  enabled: z.boolean()
}) satisfies z.ZodMiniType<RankedAvailability>
