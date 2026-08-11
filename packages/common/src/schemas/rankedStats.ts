import { z } from 'zod/mini'
import { type RankedStats } from '../types'

const nonNegativeIntegerSchema = z.int().check(z.minimum(0))
const rankedStatsTimePointSchema = z.object({
  timestamp: nonNegativeIntegerSchema,
  value: nonNegativeIntegerSchema
})

export const rankedStatsSchema = z.object({
  generatedAt: nonNegativeIntegerSchema,
  totals: z.object({
    players: nonNegativeIntegerSchema,
    matches: nonNegativeIntegerSchema,
    wins: nonNegativeIntegerSchema,
    draws: nonNegativeIntegerSchema,
    losses: nonNegativeIntegerSchema,
    forfeits: nonNegativeIntegerSchema,
    noContests: nonNegativeIntegerSchema,
    averageEloGain: z.number().check(z.minimum(0))
  }),
  current: z.object({
    activePlayers: nonNegativeIntegerSchema,
    queuedPlayers: nonNegativeIntegerSchema
  }),
  history: z.object({
    players: z.array(rankedStatsTimePointSchema),
    queue: z.array(rankedStatsTimePointSchema)
  })
}) satisfies z.ZodMiniType<RankedStats>
