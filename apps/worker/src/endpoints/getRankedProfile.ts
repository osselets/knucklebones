import { DEFAULT_RATING_POOL, rankedProfileSchema } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'
import { apiError } from '../utils/http'

interface RankedProfileRow {
  player_id: string
  rating_pool: string
  rating: number
  games_played: number
  wins: number
  draws: number
  losses: number
}

export async function getRankedProfile(
  request: BaseRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const profile = await cloudflareEnvironment.PLAYERS_DB.prepare(
    `SELECT player_id, rating_pool, rating, games_played, wins, draws, losses
     FROM player_ratings
     WHERE player_id = ? AND rating_pool = ?`
  )
    .bind(request.playerId, DEFAULT_RATING_POOL)
    .first<RankedProfileRow>()

  if (profile === null) {
    return apiError({
      status: 404,
      code: 'RANKED_PROFILE_NOT_FOUND',
      message: 'The ranked player profile was not found.',
      requestId: request.requestId
    })
  }

  const response = rankedProfileSchema.parse({
    playerId: profile.player_id,
    ratingPool: DEFAULT_RATING_POOL,
    rating: profile.rating,
    gamesPlayed: profile.games_played,
    wins: profile.wins,
    draws: profile.draws,
    losses: profile.losses
  })

  return Response.json(response, {
    headers: { 'Cache-Control': 'no-store' }
  })
}
