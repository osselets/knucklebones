import {
  type GameMode,
  type BoType,
  type Outcome,
  type OutcomeHistory
} from '../types'
import { type IDicePool } from './IDicePool'
import { type ILog } from './ILog'
import { type IPlayer } from './IPlayer'

export interface IGameState {
  playerOne: IPlayer
  playerTwo: IPlayer
  spectators: string[]
  logs: ILog[]
  nextPlayer: IPlayer
  boType: BoType
  winnerId?: string
  outcome: Outcome
  outcomeHistory: OutcomeHistory
  rematchVote?: string
  gameMode: GameMode
  dicePool?: IDicePool
}
