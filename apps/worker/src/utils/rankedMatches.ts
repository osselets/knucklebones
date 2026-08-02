import {
  calculateEloRatings,
  gameStateSchema,
  type IGameState,
  type RankedMatchAssignment,
  rankedMatchAssignmentSchema,
  type RankedMatchResult,
  type RankedMatchSettlement,
  rankedMatchSettlementSchema,
  type RankedMatchSettlementResult
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

interface RatedMatchRow {
  match_id: string
  room_key: string
  queue_key: string
  rating_pool: string
  format: string
  player_one_id: string
  player_two_id: string
  result: string
  finish_reason: string
  player_one_rating_before: number
  player_two_rating_before: number
  player_one_rating_after: number
  player_two_rating_after: number
  settled_at: number
}

interface CountRow {
  count: number
}

type CompletedRankedMatchSettlementResult = Extract<
  RankedMatchSettlementResult,
  { settlement: RankedMatchSettlement }
>

export interface ActiveRankedMatch {
  assignment: RankedMatchAssignment
  state: ActiveRankedMatchRow['state']
  activatedAt?: number
}

export type RankedMatchActivationStatus =
  'activated' | 'already-active' | 'expired'

export async function countActiveRankedPlayers(
  database: D1Database,
  queueKey: string
): Promise<number> {
  const row = await database
    .prepare(
      `SELECT COUNT(*) AS count
       FROM active_ranked_matches
       WHERE queue_key = ? AND state = 'active'`
    )
    .bind(queueKey)
    .first<CountRow>()

  if (row === null || !Number.isSafeInteger(row.count) || row.count < 0) {
    throw new Error('The active ranked match count is invalid.')
  }

  return row.count * 2
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

export async function activateRankedMatch(
  database: D1Database,
  assignment: RankedMatchAssignment,
  activatedAt = Date.now()
): Promise<RankedMatchActivationStatus> {
  const parsedAssignment = rankedMatchAssignmentSchema.parse(assignment)
  const result = await database
    .prepare(
      `UPDATE active_ranked_matches
       SET state = 'active', activated_at = ?
       WHERE match_id = ?
         AND room_key = ?
         AND queue_key = ?
         AND rating_pool = ?
         AND format = ?
         AND player_one_id = ?
         AND player_two_id = ?
         AND player_one_rating = ?
         AND player_two_rating = ?
         AND created_at = ?
         AND expires_at = ?
         AND state = 'assigned'
         AND expires_at > ?`
    )
    .bind(
      activatedAt,
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
      parsedAssignment.expiresAt,
      activatedAt
    )
    .run()

  if (result.meta.changes === 1) {
    return 'activated'
  }

  const activeMatch = await getActiveRankedMatchForPlayer(
    database,
    parsedAssignment.playerOneId,
    activatedAt
  )
  if (activeMatch === undefined) {
    return 'expired'
  }
  if (
    activeMatch.state === 'active' &&
    JSON.stringify(activeMatch.assignment) === JSON.stringify(parsedAssignment)
  ) {
    return 'already-active'
  }

  throw new Error('The ranked assignment does not match its reservation.')
}

export async function settleRankedMatch(
  database: D1Database,
  assignment: RankedMatchAssignment,
  gameState: IGameState,
  settledAt = Date.now()
): Promise<CompletedRankedMatchSettlementResult> {
  const parsedAssignment = rankedMatchAssignmentSchema.parse(assignment)
  const parsedGameState = gameStateSchema.parse(gameState)
  if (
    parsedGameState.outcome !== 'game-ended' ||
    parsedGameState.finishReason === undefined
  ) {
    throw new Error('The ranked game is not finished.')
  }
  if (
    parsedGameState.playerOne.id !== parsedAssignment.playerOneId ||
    parsedGameState.playerTwo.id !== parsedAssignment.playerTwoId
  ) {
    throw new Error('The ranked game players do not match the assignment.')
  }

  const result = getRankedMatchResult(parsedGameState, parsedAssignment)
  const ratingUpdate =
    result === 'no-contest'
      ? {
          playerOne: {
            before: parsedAssignment.playerOneRating,
            after: parsedAssignment.playerOneRating,
            change: 0
          },
          playerTwo: {
            before: parsedAssignment.playerTwoRating,
            after: parsedAssignment.playerTwoRating,
            change: 0
          }
        }
      : calculateEloRatings(
          parsedAssignment.playerOneRating,
          parsedAssignment.playerTwoRating,
          result
        )
  const createSettlement = (settlementTime: number) =>
    rankedMatchSettlementSchema.parse({
      matchId: parsedAssignment.matchId,
      roomKey: parsedAssignment.roomKey,
      queueKey: parsedAssignment.queueKey,
      ratingPool: parsedAssignment.ratingPool,
      format: parsedAssignment.format,
      playerOneId: parsedAssignment.playerOneId,
      playerTwoId: parsedAssignment.playerTwoId,
      result,
      finishReason: parsedGameState.finishReason,
      playerOne: ratingUpdate.playerOne,
      playerTwo: ratingUpdate.playerTwo,
      settledAt: settlementTime
    })
  const existingSettlement = await getRankedMatchSettlement(
    database,
    parsedAssignment.matchId
  )
  if (existingSettlement !== undefined) {
    assertSameSettlement(
      existingSettlement,
      createSettlement(existingSettlement.settledAt)
    )
    return { status: 'already-settled', settlement: existingSettlement }
  }

  const activeMatch = await getActiveRankedMatchForPlayer(
    database,
    parsedAssignment.playerOneId,
    settledAt
  )
  if (
    activeMatch?.state !== 'active' ||
    activeMatch.activatedAt === undefined ||
    JSON.stringify(activeMatch.assignment) !== JSON.stringify(parsedAssignment)
  ) {
    throw new Error('The ranked match is not active.')
  }

  const settlement = createSettlement(settledAt)

  const insert = database
    .prepare(
      `INSERT INTO rated_matches (
         match_id, room_key, queue_key, rating_pool, format,
         player_one_id, player_two_id, result, finish_reason,
         player_one_rating_before, player_two_rating_before,
         player_one_rating_after, player_two_rating_after, rating_delta,
         created_at, activated_at, finished_at, settled_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      settlement.matchId,
      settlement.roomKey,
      settlement.queueKey,
      settlement.ratingPool,
      settlement.format,
      settlement.playerOneId,
      settlement.playerTwoId,
      settlement.result,
      settlement.finishReason,
      settlement.playerOne.before,
      settlement.playerTwo.before,
      settlement.playerOne.after,
      settlement.playerTwo.after,
      settlement.playerOne.change,
      parsedAssignment.createdAt,
      activeMatch.activatedAt,
      settledAt,
      settledAt
    )
  const removeActiveMatch = database
    .prepare('DELETE FROM active_ranked_matches WHERE match_id = ?')
    .bind(settlement.matchId)
  const statements = [insert]

  if (result !== 'no-contest') {
    statements.push(
      createRatingUpdateStatement(
        database,
        settlement.playerOneId,
        settlement.ratingPool,
        settlement.playerOne.before,
        settlement.playerOne.after,
        getPlayerStatistics(result, 'player-one'),
        settledAt
      ),
      createRatingUpdateStatement(
        database,
        settlement.playerTwoId,
        settlement.ratingPool,
        settlement.playerTwo.before,
        settlement.playerTwo.after,
        getPlayerStatistics(result, 'player-two'),
        settledAt
      )
    )
  }
  statements.push(removeActiveMatch)

  try {
    const results = await database.batch(statements)
    if (results.some((batchResult) => !batchResult.success)) {
      throw new Error('The ranked settlement batch was not successful.')
    }
  } catch (error) {
    const concurrentSettlement = await getRankedMatchSettlement(
      database,
      parsedAssignment.matchId
    )
    if (concurrentSettlement !== undefined) {
      assertSameSettlement(concurrentSettlement, settlement)
      return {
        status: 'already-settled',
        settlement: concurrentSettlement
      }
    }
    throw error
  }

  return { status: 'settled', settlement }
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

export async function expireRankedAssignment(
  database: D1Database,
  matchId: string,
  now = Date.now()
): Promise<boolean> {
  const result = await database
    .prepare(
      `DELETE FROM active_ranked_matches
       WHERE match_id = ? AND state = 'assigned' AND expires_at <= ?`
    )
    .bind(matchId, now)
    .run()
  return result.meta.changes === 1
}

async function getRankedMatchSettlement(
  database: D1Database,
  matchId: string
): Promise<RankedMatchSettlement | undefined> {
  const row = await database
    .prepare(
      `SELECT match_id, room_key, queue_key, rating_pool, format,
              player_one_id, player_two_id, result, finish_reason,
              player_one_rating_before, player_two_rating_before,
              player_one_rating_after, player_two_rating_after, settled_at
       FROM rated_matches
       WHERE match_id = ?`
    )
    .bind(matchId)
    .first<RatedMatchRow>()

  if (row === null) {
    return
  }

  return rankedMatchSettlementSchema.parse({
    matchId: row.match_id,
    roomKey: row.room_key,
    queueKey: row.queue_key,
    ratingPool: row.rating_pool,
    format: row.format,
    playerOneId: row.player_one_id,
    playerTwoId: row.player_two_id,
    result: row.result,
    finishReason: row.finish_reason,
    playerOne: {
      before: row.player_one_rating_before,
      after: row.player_one_rating_after,
      change: row.player_one_rating_after - row.player_one_rating_before
    },
    playerTwo: {
      before: row.player_two_rating_before,
      after: row.player_two_rating_after,
      change: row.player_two_rating_after - row.player_two_rating_before
    },
    settledAt: row.settled_at
  })
}

function getRankedMatchResult(
  gameState: IGameState,
  assignment: RankedMatchAssignment
): RankedMatchResult {
  if (gameState.finishReason === 'no-contest') {
    return 'no-contest'
  }
  if (gameState.winnerId === assignment.playerOneId) {
    return 'player-one-win'
  }
  if (gameState.winnerId === assignment.playerTwoId) {
    return 'player-two-win'
  }
  if (gameState.finishReason === 'completed') {
    return 'draw'
  }
  throw new Error('The ranked result has no valid winner.')
}

function createRatingUpdateStatement(
  database: D1Database,
  playerId: string,
  ratingPool: string,
  ratingBefore: number,
  ratingAfter: number,
  statistics: { wins: number; draws: number; losses: number },
  updatedAt: number
): D1PreparedStatement {
  return database
    .prepare(
      `UPDATE player_ratings
       SET rating = ?,
           games_played = games_played + 1,
           wins = wins + ?,
           draws = draws + ?,
           losses = losses + ?,
           updated_at = ?
       WHERE player_id = ? AND rating_pool = ? AND rating = ?`
    )
    .bind(
      ratingAfter,
      statistics.wins,
      statistics.draws,
      statistics.losses,
      updatedAt,
      playerId,
      ratingPool,
      ratingBefore
    )
}

function getPlayerStatistics(
  result: Exclude<RankedMatchResult, 'no-contest'>,
  player: 'player-one' | 'player-two'
): { wins: number; draws: number; losses: number } {
  if (result === 'draw') {
    return { wins: 0, draws: 1, losses: 0 }
  }
  const won = result === `${player}-win`
  return { wins: won ? 1 : 0, draws: 0, losses: won ? 0 : 1 }
}

function assertSameSettlement(
  actual: RankedMatchSettlement,
  expected: RankedMatchSettlement
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('The ranked match has a conflicting settled result.')
  }
}
