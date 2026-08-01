import { z } from 'zod/mini'
import { DEFAULT_RATING_POOL, type RankedProfile } from '../types'

export const rankedProfileSchema = z.object({
  playerId: z.uuidv4(),
  ratingPool: z.literal(DEFAULT_RATING_POOL),
  rating: z.number(),
  gamesPlayed: z.number(),
  wins: z.number(),
  draws: z.number(),
  losses: z.number()
}) satisfies z.ZodMiniType<RankedProfile>
