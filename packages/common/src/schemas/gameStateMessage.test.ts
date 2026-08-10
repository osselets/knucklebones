import { describe, expect, it } from 'vitest'
import { GameState } from '../classes/GameState'
import { Player } from '../classes/Player'
import {
  compatibleGameStateMessageSchema,
  gameServerEventSchema,
  getGameStateMessagePayload,
  toGameErrorMessage,
  toGameStateMessage
} from './gameStateMessage'

const roomKey = '11111111-1111-4111-8111-111111111111'
const playerId = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'

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
    const message = toGameStateMessage(
      createSerializedGameState(),
      roomKey,
      requestId
    )

    expect(compatibleGameStateMessageSchema.parse(message)).toEqual(message)
    expect(
      getGameStateMessagePayload(
        compatibleGameStateMessageSchema.parse(message)
      )
    ).toEqual(message.payload)
  })

  it('accepts the previous flattened versioned contract during rollout', () => {
    const gameState = createSerializedGameState()
    const message = {
      ...gameState,
      roomKey: 'legacy-room',
      type: 'game.state' as const,
      version: 1 as const
    }

    expect(compatibleGameStateMessageSchema.parse(message)).toEqual(message)
  })

  it('accepts a legacy unversioned game state during rollout', () => {
    const gameState = createSerializedGameState()

    expect(compatibleGameStateMessageSchema.parse(gameState)).toEqual(gameState)
  })

  it('rejects string match lengths received from malformed query parsing', () => {
    const message = {
      ...toGameStateMessage(createSerializedGameState(), roomKey),
      payload: {
        roomKey,
        gameState: { ...createSerializedGameState(), boType: '1' }
      }
    }

    expect(compatibleGameStateMessageSchema.safeParse(message).success).toBe(
      false
    )
  })
})

describe('gameServerEventSchema', () => {
  it.each([
    {
      version: 1,
      type: 'game.presence',
      payload: { roomKey, playerId, connected: true }
    },
    {
      version: 1,
      type: 'game.reconnect-deadline',
      payload: { roomKey, playerId, expiresAt: 1000 }
    },
    {
      version: 1,
      type: 'game.error',
      payload: {
        code: 'ROOM_CLOSED',
        message: 'The room is closed.',
        requestId,
        retryable: false
      }
    }
  ])('accepts the $type event contract', (event) => {
    expect(gameServerEventSchema.parse(event)).toEqual(event)
  })

  it('rejects unknown versions and event types', () => {
    expect(
      gameServerEventSchema.safeParse({
        version: 2,
        type: 'game.unknown',
        payload: {}
      }).success
    ).toBe(false)
  })

  it('creates a versioned game error from API error details', () => {
    const message = toGameErrorMessage({
      code: 'RANKED_ASSIGNMENT_EXPIRED',
      message: 'Returning to matchmaking.',
      requestId,
      retryable: true
    })

    expect(gameServerEventSchema.parse(message)).toEqual(message)
  })
})
