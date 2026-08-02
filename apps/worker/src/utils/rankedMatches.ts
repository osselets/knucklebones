import {
  type RankedMatchAssignment,
  rankedMatchAssignmentSchema
} from '@knucklebones/common'

interface ActiveRankedMatchRow {
  match_id: string
  room_key: string
  queue_key: string
  rating_pool: string
  format: string
  player_one_id: string
  player_two_id: string
  player_one_rating: number
  player_two_rating: number
  state: 'assigned' | 'active'
  created_at: number
  expires_at: number
  activated_at: number | null
}

export interface ActiveRankedMatch {
  assignment: RankedMatchAssignment
  state: ActiveRankedMatchRow['state']
  activatedAt?: number
}

export async function getActiveRankedMatchForPlayer(
  database: D1Database,
  playerId: string,
  now = Date.now()
): Promise<ActiveRankedMatch | undefined> {
  const row = await database
    .prepare(
      `SELECT match_id, room_key, queue_key, rating_pool, format,
              player_one_id, player_two_id,
              player_one_rating, player_two_rating,
              state, created_at, expires_at, activated_at
       FROM active_ranked_matches
       WHERE player_one_id = ? OR player_two_id = ?
       LIMIT 1`
    )
    .bind(playerId, playerId)
    .first<ActiveRankedMatchRow>()

  if (row === null) {
    return
  }

  if (row.state === 'assigned' && row.expires_at <= now) {
    await database
      .prepare(
        `DELETE FROM active_ranked_matches
         WHERE match_id = ? AND state = 'assigned' AND expires_at <= ?`
      )
      .bind(row.match_id, now)
      .run()
    return
  }

  return {
    assignment: rankedMatchAssignmentSchema.parse({
      matchId: row.match_id,
      roomKey: row.room_key,
      queueKey: row.queue_key,
      ratingPool: row.rating_pool,
      format: row.format,
      playerOneId: row.player_one_id,
      playerTwoId: row.player_two_id,
      playerOneRating: row.player_one_rating,
      playerTwoRating: row.player_two_rating,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    }),
    state: row.state,
    ...(row.activated_at !== null && { activatedAt: row.activated_at })
  }
}

export async function reserveRankedMatch(
  database: D1Database,
  assignment: RankedMatchAssignment
): Promise<void> {
  const parsedAssignment = rankedMatchAssignmentSchema.parse(assignment)
  if (parsedAssignment.expiresAt <= parsedAssignment.createdAt) {
    throw new Error('The ranked assignment expiry is invalid.')
  }

  const result = await database
    .prepare(
      `INSERT INTO active_ranked_matches (
         match_id, room_key, queue_key, rating_pool, format,
         player_one_id, player_two_id,
         player_one_rating, player_two_rating,
         state, created_at, expires_at, activated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, NULL)`
    )
    .bind(
      parsedAssignment.matchId,
      parsedAssignment.roomKey,
      parsedAssignment.queueKey,
      parsedAssignment.ratingPool,
      parsedAssignment.format,
      parsedAssignment.playerOneId,
      parsedAssignment.playerTwoId,
      parsedAssignment.playerOneRating,
      parsedAssignment.playerTwoRating,
      parsedAssignment.createdAt,
      parsedAssignment.expiresAt
    )
    .run()

  if (result.meta.changes !== 1) {
    throw new Error('The ranked assignment was not reserved.')
  }
}

export async function releaseRankedMatch(
  database: D1Database,
  matchId: string
): Promise<void> {
  await database
    .prepare('DELETE FROM active_ranked_matches WHERE match_id = ?')
    .bind(matchId)
    .run()
}
