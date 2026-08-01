export interface Play {
  dice: number
  column: number
  author: string
}

export interface PlayIntent {
  column: 0 | 1 | 2
}

export type PlayRejectionReason =
  | 'game-ended'
  | 'unknown-player'
  | 'not-player-turn'
  | 'unexpected-die'
  | 'invalid-column'
  | 'column-full'

export type PlayIntentRejectionReason =
  | 'game-not-initialized'
  | 'game-ended'
  | 'unknown-player'
  | 'not-player-turn'
  | 'invalid-column'
  | 'column-full'
  | 'invalid-game-state'
  | 'stale-revision'
