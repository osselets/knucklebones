import {
  DEFAULT_RATING_POOL,
  matchmakingPopulationSchema,
  RANKED_QUEUE_KEY,
  rankedStatsSchema,
  type RankedStatsTimePoint
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'

const DAY_MS = 24 * 60 * 60 * 1_000
const PLAYER_HISTORY_DAYS = 30
const QUEUE_HISTORY_MS = DAY_MS
const QUEUE_BUCKET_MS = 15 * 60 * 1_000

interface ProfileTotalsRow {
  players: number
  wins: number
  draws: number
  losses: number
}

interface MatchTotalsRow {
  matches: number
  forfeits: number
  no_contests: number
  average_elo_gain: number
}

interface CountRow {
  count: number
}

interface TimeCountRow {
  timestamp: number
  count: number
}

interface QueueSampleRow {
  timestamp: number
  value: number
}

export async function getRankedStats(
  _request: Request,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const now = Date.now()
  const firstPlayerDay = startOfUtcDay(now) - (PLAYER_HISTORY_DAYS - 1) * DAY_MS
  const queueSince = now - QUEUE_HISTORY_MS
  const database = cloudflareEnvironment.PLAYERS_DB

  const [
    profileTotals,
    matchTotals,
    earlierPlayers,
    playerRows,
    queueRows,
    population
  ] = await Promise.all([
    database
      .prepare(
        `SELECT COUNT(*) AS players,
                COALESCE(SUM(wins), 0) AS wins,
                COALESCE(SUM(draws), 0) AS draws,
                COALESCE(SUM(losses), 0) AS losses
         FROM player_ratings
         WHERE rating_pool = ?`
      )
      .bind(DEFAULT_RATING_POOL)
      .first<ProfileTotalsRow>(),
    database
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN result <> 'no-contest' THEN 1 ELSE 0 END), 0)
             AS matches,
           COALESCE(SUM(CASE WHEN finish_reason = 'forfeit' THEN 1 ELSE 0 END), 0)
             AS forfeits,
           COALESCE(SUM(CASE WHEN finish_reason = 'no-contest' THEN 1 ELSE 0 END), 0)
             AS no_contests,
           COALESCE(AVG(CASE WHEN result <> 'no-contest' AND rating_delta <> 0
             THEN ABS(rating_delta) END), 0) AS average_elo_gain
         FROM rated_matches
         WHERE rating_pool = ?`
      )
      .bind(DEFAULT_RATING_POOL)
      .first<MatchTotalsRow>(),
    database
      .prepare('SELECT COUNT(*) AS count FROM players WHERE created_at < ?')
      .bind(firstPlayerDay)
      .first<CountRow>(),
    database
      .prepare(
        `SELECT CAST(created_at / ? AS INTEGER) * ? AS timestamp,
                COUNT(*) AS count
         FROM players
         WHERE created_at >= ?
         GROUP BY timestamp
         ORDER BY timestamp`
      )
      .bind(DAY_MS, DAY_MS, firstPlayerDay)
      .all<TimeCountRow>(),
    database
      .prepare(
        `SELECT CAST(sampled_at / ? AS INTEGER) * ? AS timestamp,
                MAX(queued_players) AS value
         FROM ranked_queue_samples
         WHERE queue_key = ? AND sampled_at >= ?
         GROUP BY timestamp
         ORDER BY timestamp`
      )
      .bind(QUEUE_BUCKET_MS, QUEUE_BUCKET_MS, RANKED_QUEUE_KEY, queueSince)
      .all<QueueSampleRow>(),
    getCurrentPopulation(cloudflareEnvironment)
  ])

  if (
    profileTotals === null ||
    matchTotals === null ||
    earlierPlayers === null
  ) {
    throw new Error('The ranked statistics query returned no result.')
  }

  const response = rankedStatsSchema.parse({
    generatedAt: now,
    totals: {
      players: profileTotals.players,
      matches: matchTotals.matches,
      wins: profileTotals.wins,
      draws: profileTotals.draws,
      losses: profileTotals.losses,
      forfeits: matchTotals.forfeits,
      noContests: matchTotals.no_contests,
      averageEloGain: matchTotals.average_elo_gain
    },
    current: population,
    history: {
      players: buildPlayerHistory(
        firstPlayerDay,
        earlierPlayers.count,
        playerRows.results
      ),
      queue: appendCurrentQueueSample(
        queueRows.results,
        now,
        population.queuedPlayers
      )
    }
  })

  return Response.json(response, {
    headers: { 'Cache-Control': 'public, max-age=15' }
  })
}

async function getCurrentPopulation(
  cloudflareEnvironment: CloudflareEnvironment
) {
  const id =
    cloudflareEnvironment.MATCHMAKING_DURABLE_OBJECT.idFromName(
      RANKED_QUEUE_KEY
    )
  const matchmaking = cloudflareEnvironment.MATCHMAKING_DURABLE_OBJECT.get(id)
  const response = await matchmaking.fetch('https://dummy-url/population')
  if (!response.ok) {
    throw new Error('The matchmaker rejected the population request.')
  }
  return matchmakingPopulationSchema.parse(await response.json())
}

function buildPlayerHistory(
  firstDay: number,
  earlierPlayers: number,
  rows: TimeCountRow[]
): RankedStatsTimePoint[] {
  const counts = new Map(rows.map((row) => [row.timestamp, row.count]))
  let total = earlierPlayers

  return Array.from({ length: PLAYER_HISTORY_DAYS }, (_, index) => {
    const timestamp = firstDay + index * DAY_MS
    total += counts.get(timestamp) ?? 0
    return { timestamp, value: total }
  })
}

function appendCurrentQueueSample(
  rows: QueueSampleRow[],
  now: number,
  queuedPlayers: number
): RankedStatsTimePoint[] {
  const history = rows.map(({ timestamp, value }) => ({ timestamp, value }))
  const currentBucket = Math.floor(now / QUEUE_BUCKET_MS) * QUEUE_BUCKET_MS
  const last = history.at(-1)

  if (last?.timestamp === currentBucket) {
    last.value = Math.max(last.value, queuedPlayers)
  } else {
    history.push({ timestamp: currentBucket, value: queuedPlayers })
  }

  return history
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}
