import { type GameMode, type BoType } from '../types'
import { type IPlayer } from './IPlayer'

export interface ILobby {
  players: IPlayer[]
  boType?: BoType
  gameMode?: GameMode
}
