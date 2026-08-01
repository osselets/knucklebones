export interface Play {
  dice: number
  column: number
  author: string
}

export type PlayRejectionReason =
  | 'game-ended'
  | 'unknown-player'
  | 'not-player-turn'
  | 'unexpected-die'
  | 'invalid-column'
  | 'column-full'
