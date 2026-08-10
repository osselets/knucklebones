import { describe, expect, it } from 'vitest'
import { GameState } from '../classes/GameState'
import { Player } from '../classes/Player'
import {
  idempotentInitializeGameResultSchema,
  idempotentPlayGameResultSchema,
  idempotentResignGameResultSchema,
  playGameCommandSchema,
  resignGameCommandSchema
} from './durableObject'

function createSerializedGameState() {
  const playerOne = new Player('player-one')
  const playerTwo = new Player('player-two')

  return new GameState({
    playerOne,
    playerTwo,
    nextPlayer: playerOne,
    outcome: 'ongoing',
    boType: 1
  }).toJson()
}

describe('Durable Object result contracts', () => {
  it('validates command identifiers and numeric ranges', () => {
    expect(
      playGameCommandSchema.parse({
        mutationId: '11111111-1111-4111-8111-111111111111',
        actorId: '22222222-2222-4222-8222-222222222222',
        column: 2,
        expectedRevision: 4
      })
    ).toMatchObject({ column: 2, expectedRevision: 4 })

    expect(
      playGameCommandSchema.safeParse({
        mutationId: 'not-a-mutation-id',
        actorId: 'not-a-player-id',
        column: 3,
        expectedRevision: -1
      }).success
    ).toBe(false)

    expect(
      resignGameCommandSchema.parse({
        mutationId: '11111111-1111-4111-8111-111111111111',
        playerId: '22222222-2222-4222-8222-222222222222'
      })
    ).toMatchObject({
      playerId: '22222222-2222-4222-8222-222222222222'
    })
  })

  it('accepts applied, replayed, and conflicting mutation results', () => {
    const gameState = createSerializedGameState()

    expect(
      idempotentInitializeGameResultSchema.parse({
        idempotencyStatus: 'applied',
        value: { status: 'created', gameState }
      })
    ).toEqual({
      idempotencyStatus: 'applied',
      value: { status: 'created', gameState }
    })
    expect(
      idempotentPlayGameResultSchema.parse({
        idempotencyStatus: 'replayed',
        value: { status: 'rejected', reason: 'stale-revision' }
      })
    ).toEqual({
      idempotencyStatus: 'replayed',
      value: { status: 'rejected', reason: 'stale-revision' }
    })
    expect(
      idempotentPlayGameResultSchema.parse({
        idempotencyStatus: 'conflict'
      })
    ).toEqual({ idempotencyStatus: 'conflict' })
    expect(
      idempotentResignGameResultSchema.parse({
        idempotencyStatus: 'applied',
        value: { status: 'updated', gameState }
      })
    ).toMatchObject({
      idempotencyStatus: 'applied',
      value: { status: 'updated' }
    })
  })

  it('rejects malformed command results', () => {
    expect(
      idempotentPlayGameResultSchema.safeParse({
        idempotencyStatus: 'applied',
        value: { status: 'rejected', reason: 'made-up-reason' }
      }).success
    ).toBe(false)
  })
})
