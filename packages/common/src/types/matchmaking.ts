import { DEFAULT_RATING_POOL, type RatingPool } from './ranking'

export const RANKED_MATCH_FORMAT = 'bo1'
export const RANKED_QUEUE_KEY = `${DEFAULT_RATING_POOL}:${RANKED_MATCH_FORMAT}`

export type RankedMatchFormat = typeof RANKED_MATCH_FORMAT
export type RankedQueueKey = typeof RANKED_QUEUE_KEY

export interface RankedMatchAssignment {
  matchId: string
  roomKey: string
  queueKey: RankedQueueKey
  ratingPool: RatingPool
  format: RankedMatchFormat
  playerOneId: string
  playerTwoId: string
  playerOneRating: number
  playerTwoRating: number
  createdAt: number
  expiresAt: number
}

export type MatchmakingStatus =
  | { status: 'idle' }
  | { status: 'waiting'; joinedAt: number }
  | { status: 'matched'; match: RankedMatchAssignment }
