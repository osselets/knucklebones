import { describe, expect, it } from 'vitest'
import {
  GameState,
  type IGameState,
  Player,
  type PlayGameCommand
} from '@knucklebones/common'
import { applyPlayCommand } from '../src/utils/authoritativeGame'

const playerOneId = '11111111-1111-4111-8111-111111111111'
const playerTwoId = '22222222-2222-4222-8222-222222222222'

function createGameState() {
  const playerOne = new Player(playerOneId, undefined, undefined, 4)
  const playerTwo = new Player(playerTwoId)

  return new GameState({
    revision: 2,
    playerOne,
    playerTwo,
    nextPlayer: playerOne,
    outcome: 'ongoing',
    boType: 1
  }).toJson()
}

function command(overrides: Partial<PlayGameCommand> = {}): PlayGameCommand {
  return {
    mutationId: '33333333-3333-4333-8333-333333333333',
    actorId: playerOneId,
    column: 0,
    expectedRevision: 2,
    ...overrides
  }
}

describe('applyPlayCommand', () => {
  it('applies a column intent using the server-issued die', () => {
    const result = applyPlayCommand(createGameState(), command())

    expect(result.status).toBe('updated')
    if (result.status !== 'updated') {
      throw new Error('Expected the play intent to be applied.')
    }
    expect(result.gameState.playerOne.columns).toEqual([[4], [], []])
  })

  it('rejects a stale command without mutating its snapshot', () => {
    const gameState = createGameState()
    const originalGameState = structuredClone(gameState)

    expect(
      applyPlayCommand(gameState, command({ expectedRevision: 1 }))
    ).toEqual({ status: 'rejected', reason: 'stale-revision' })
    expect(gameState).toEqual(originalGameState)
  })

  it('rejects missing and malformed authoritative state', () => {
    expect(applyPlayCommand(undefined, command())).toEqual({
      status: 'rejected',
      reason: 'game-not-initialized'
    })

    const malformed = {
      ...createGameState(),
      playerOne: { ...createGameState().playerOne, columns: [[1, 2, 3, 4]] }
    } as IGameState
    expect(applyPlayCommand(malformed, command())).toEqual({
      status: 'rejected',
      reason: 'invalid-game-state'
    })
  })
})
