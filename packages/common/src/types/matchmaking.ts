import type { GameFinishReason } from './outcome'
import {
  DEFAULT_RATING_POOL,
  type EloMatchResult,
  type EloRatingChange,
  type RatingPool
} from './ranking'

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

export type RankedMatchResult = EloMatchResult | 'no-contest'

export interface RankedMatchSettlement {
  matchId: string
  roomKey: string
  queueKey: RankedQueueKey
  ratingPool: RatingPool
  format: RankedMatchFormat
  playerOneId: string
  playerTwoId: string
  result: RankedMatchResult
  finishReason: GameFinishReason
  playerOne: EloRatingChange
  playerTwo: EloRatingChange
  settledAt: number
}

export type RankedMatchSettlementResult =
  | { status: 'not-ranked' | 'not-finished' }
  | {
      status: 'settled' | 'already-settled'
      settlement: RankedMatchSettlement
    }
