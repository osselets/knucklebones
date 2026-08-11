import { DEFAULT_RATING_POOL, rankedProfileSchema } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type AuthenticatedRequestWithProps } from '../types/itty'
import { apiError } from '../utils/http'

interface RankedProfileRow {
  player_id: string
  display_name: string
  rating_pool: string
  rating: number
  games_played: number
  wins: number
  draws: number
  losses: number
}

export async function getRankedProfile(
  request: AuthenticatedRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const playerId = request.principal.playerId
  const profile = await cloudflareEnvironment.PLAYERS_DB.prepare(
    `SELECT ratings.player_id, players.display_name, ratings.rating_pool,
            ratings.rating, ratings.games_played, ratings.wins,
            ratings.draws, ratings.losses
     FROM player_ratings AS ratings
     INNER JOIN players ON players.player_id = ratings.player_id
     WHERE ratings.player_id = ? AND ratings.rating_pool = ?`
  )
    .bind(playerId, DEFAULT_RATING_POOL)
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
    displayName: profile.display_name,
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
