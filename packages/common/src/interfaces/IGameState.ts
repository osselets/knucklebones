import {
  type BoType,
  type GameFinishReason,
  type GameForfeitReason,
  type Outcome,
  type OutcomeHistory,
  type RankedTurnState
} from '../types'
import { type ILog } from './ILog'
import { type IPlayer } from './IPlayer'

export interface IGameState {
  revision: number
  playerOne: IPlayer
  playerTwo: IPlayer
  spectators: string[]
  logs: ILog[]
  nextPlayer: IPlayer
  boType: BoType
  winnerId?: string
  outcome: Outcome
  finishReason?: GameFinishReason
  forfeitReason?: GameForfeitReason
  outcomeHistory: OutcomeHistory
  rematchVote?: string
  rankedTurn?: RankedTurnState
}
