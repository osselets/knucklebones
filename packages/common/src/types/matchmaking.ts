import { type RatingPool } from './ranking'

export const RANKED_MATCH_FORMAT = 'bo1'

export type RankedMatchFormat = typeof RANKED_MATCH_FORMAT

export interface RankedMatchAssignment {
  matchId: string
  roomKey: string
  ratingPool: RatingPool
  format: RankedMatchFormat
  playerOneId: string
  playerTwoId: string
  createdAt: number
}

export type MatchmakingStatus =
  | { status: 'idle' }
  | { status: 'waiting'; joinedAt: number }
  | { status: 'matched'; match: RankedMatchAssignment }
