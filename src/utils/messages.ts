import { Types } from 'ably'
import { GameState } from '../../shared/types/gameState'

interface GameStateMessage extends Types.Message {
  data: GameState
  name: 'game-state-update'
}

export function isItGameStateMessage(
  message: Types.Message
): message is GameStateMessage {
  return message.name === 'game-state-update'
}
