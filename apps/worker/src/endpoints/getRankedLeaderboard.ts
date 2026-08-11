import {
  DEFAULT_RATING_POOL,
  rankedLeaderboardSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type AuthenticatedRequestWithProps } from '../types/itty'

interface LeaderboardRow {
  rank: number | null
  player_id: string
  display_name: string
  rating: number
}

export async function getRankedLeaderboard(
  request: AuthenticatedRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const database = cloudflareEnvironment.PLAYERS_DB
  const [topPlayers, currentPlayer] = await Promise.all([
    database
      .prepare(
        `SELECT
           1 + (
             SELECT COUNT(*)
             FROM player_ratings AS higher
             WHERE higher.rating_pool = ratings.rating_pool
               AND higher.games_played > 0
               AND higher.rating > ratings.rating
           ) AS rank,
           ratings.player_id,
           players.display_name,
           ratings.rating
         FROM player_ratings AS ratings
         INNER JOIN players ON players.player_id = ratings.player_id
         WHERE ratings.rating_pool = ? AND ratings.games_played > 0
         ORDER BY ratings.rating DESC, ratings.player_id
         LIMIT 10`
      )
      .bind(DEFAULT_RATING_POOL)
      .all<LeaderboardRow>(),
    database
      .prepare(
        `SELECT
           CASE
             WHEN ratings.games_played = 0 THEN NULL
             ELSE 1 + (
               SELECT COUNT(*)
               FROM player_ratings AS higher
               WHERE higher.rating_pool = ratings.rating_pool
                 AND higher.games_played > 0
                 AND higher.rating > ratings.rating
             )
           END AS rank,
           ratings.player_id,
           players.display_name,
           ratings.rating
         FROM player_ratings AS ratings
         INNER JOIN players ON players.player_id = ratings.player_id
         WHERE ratings.player_id = ? AND ratings.rating_pool = ?`
      )
      .bind(request.principal.playerId, DEFAULT_RATING_POOL)
      .first<LeaderboardRow>()
  ])

  if (currentPlayer === null) {
    throw new Error('The current ranked player profile was not found.')
  }

  const response = rankedLeaderboardSchema.parse({
    topPlayers: topPlayers.results.map(toLeaderboardEntry),
    currentPlayer: toLeaderboardEntry(currentPlayer)
  })

  return Response.json(response, {
    headers: { 'Cache-Control': 'no-store' }
  })
}

function toLeaderboardEntry(row: LeaderboardRow) {
  return {
    rank: row.rank,
    playerId: row.player_id,
    displayName: row.display_name,
    rating: row.rating
  }
}
