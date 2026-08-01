import { describe, expect, it } from 'vitest'
import { GameState } from '../classes/GameState'
import { Player } from '../classes/Player'
import {
  compatibleGameStateMessageSchema,
  toGameStateMessage
} from './gameStateMessage'

function createSerializedGameState() {
  const playerOne = new Player('player-one', 'Player One', undefined, 2)
  const playerTwo = new Player('player-two', 'Player Two')
  return new GameState({
    revision: 3,
    playerOne,
    playerTwo,
    nextPlayer: playerOne,
    outcome: 'ongoing',
    boType: 1
  }).toJson()
}

describe('compatibleGameStateMessageSchema', () => {
  it('accepts the current versioned game-state contract', () => {
    const message = toGameStateMessage(createSerializedGameState(), 'room-one')

    expect(compatibleGameStateMessageSchema.parse(message)).toEqual(message)
  })

  it('accepts a legacy unversioned game state during rollout', () => {
    const gameState = createSerializedGameState()

    expect(compatibleGameStateMessageSchema.parse(gameState)).toEqual(gameState)
  })

  it('rejects string match lengths received from malformed query parsing', () => {
    const message = {
      ...toGameStateMessage(createSerializedGameState(), 'room-one'),
      boType: '1'
    }

    expect(compatibleGameStateMessageSchema.safeParse(message).success).toBe(
      false
    )
  })
})
