export const DEFAULT_RATING_POOL = 'classic'
export const DEFAULT_ELO_RATING = 1200
export const ELO_K_FACTOR = 32

export type RatingPool = typeof DEFAULT_RATING_POOL
export type EloMatchResult = 'player-one-win' | 'draw' | 'player-two-win'

export interface EloRatingChange {
  before: number
  after: number
  change: number
}

export interface EloRatingUpdate {
  playerOne: EloRatingChange
  playerTwo: EloRatingChange
}

export interface RankedProfile {
  playerId: string
  displayName: string
  ratingPool: RatingPool
  rating: number
  gamesPlayed: number
  wins: number
  draws: number
  losses: number
}

export interface RankedLeaderboardEntry {
  rank: number
  playerId: string
  displayName: string
  rating: number
}

export interface CurrentRankedLeaderboardEntry {
  rank: number | null
  playerId: string
  displayName: string
  rating: number
}

export interface RankedLeaderboard {
  topPlayers: RankedLeaderboardEntry[]
  currentPlayer: CurrentRankedLeaderboardEntry
}
