export type Difficulty = 'easy' | 'medium' | 'hard'
export type BoType = 'indefinite' | 1 | 3 | 5
export type PlayerType = 'human' | 'ai'
export type GameMode = 'classic' | 'dice-pool'

export interface GameSettings {
  playerType: PlayerType
  boType: BoType
  difficulty?: Difficulty
  gameMode: GameMode
}
