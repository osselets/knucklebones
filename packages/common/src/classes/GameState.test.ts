import { describe, expect, it } from 'vitest'
import { GameState } from './GameState'
import { Player } from './Player'

function createGameState() {
  const playerOne = new Player('player-one', 'Player One', undefined, 4)
  const playerTwo = new Player('player-two', 'Player Two')

  return new GameState({
    playerOne,
    playerTwo,
    nextPlayer: playerOne,
    outcome: 'ongoing'
  })
}

describe('GameState play validation', () => {
  it('derives the die and actor state from a column-only intent', () => {
    const gameState = createGameState()

    expect(gameState.applyPlayIntent('player-one', 1)).toBeUndefined()

    expect(gameState.playerOne.columns).toEqual([[], [4], []])
    expect(gameState.nextPlayer.id).toBe('player-two')
  })

  it.each([
    ['unknown-player', 'spectator', 0],
    ['not-player-turn', 'player-two', 0],
    ['invalid-column', 'player-one', 3]
  ] as const)(
    'rejects a %s play intent without changing state',
    (reason, actorId, column) => {
      const gameState = createGameState()
      const originalState = gameState.toJson()

      expect(gameState.applyPlayIntent(actorId, column)).toBe(reason)
      expect(gameState.toJson()).toEqual(originalState)
    }
  )

  it('rejects an inconsistent server-issued die', () => {
    const gameState = createGameState()
    gameState.nextPlayer = new Player('player-one', 'Player One', undefined, 3)

    expect(gameState.applyPlayIntent('player-one', 0)).toBe(
      'invalid-game-state'
    )
    expect(gameState.playerOne.columns).toEqual([[], [], []])
  })

  it('applies a valid move and advances the turn', () => {
    const gameState = createGameState()

    gameState.applyPlay({ author: 'player-one', column: 1, dice: 4 }, false)

    expect(gameState.playerOne.columns).toEqual([[], [4], []])
    expect(gameState.nextPlayer.id).toBe('player-two')
  })

  it('does not mutate serialized state while applying an optimistic move', () => {
    const serializedState = createGameState().toJson()
    const hydratedState = GameState.fromJson(serializedState)

    hydratedState.applyPlay({ author: 'player-one', column: 1, dice: 4 }, false)

    expect(hydratedState.playerOne.columns).toEqual([[], [4], []])
    expect(serializedState.playerOne.columns).toEqual([[], [], []])
  })

  it.each([
    ['unknown-player', { author: 'spectator', column: 0, dice: 4 }],
    ['not-player-turn', { author: 'player-two', column: 0, dice: 4 }],
    ['unexpected-die', { author: 'player-one', column: 0, dice: 3 }],
    ['invalid-column', { author: 'player-one', column: 3, dice: 4 }]
  ] as const)('rejects %s without changing the state', (reason, play) => {
    const gameState = createGameState()
    const originalState = gameState.toJson()

    expect(gameState.getPlayRejectionReason(play)).toBe(reason)
    expect(() => gameState.applyPlay(play)).toThrow(`Invalid play: ${reason}.`)
    expect(gameState.toJson()).toEqual(originalState)
  })

  it('rejects a full column', () => {
    const gameState = createGameState()
    gameState.playerOne.columns[0] = [1, 2, 3]

    expect(
      gameState.getPlayRejectionReason({
        author: 'player-one',
        column: 0,
        dice: 4
      })
    ).toBe('column-full')
  })

  it('rejects every move after the game ends', () => {
    const gameState = createGameState()
    gameState.outcome = 'game-ended'

    expect(
      gameState.getPlayRejectionReason({
        author: 'player-one',
        column: 0,
        dice: 4
      })
    ).toBe('game-ended')
  })

  it('records the final outcome when a BO1 board is completed', () => {
    const playerOne = new Player('player-one', 'Player One', undefined, 6, [
      [1, 2, 3],
      [1, 2, 3],
      [4, 5]
    ])
    const playerTwo = new Player('player-two', 'Player Two')
    const gameState = new GameState({
      playerOne,
      playerTwo,
      nextPlayer: playerOne,
      outcome: 'ongoing',
      boType: 1
    })

    gameState.applyPlay({ author: 'player-one', column: 2, dice: 6 })

    expect(gameState.outcome).toBe('game-ended')
    expect(gameState.finishReason).toBe('completed')
    expect(gameState.winnerId).toBe('player-one')
    expect(gameState.outcomeHistory).toEqual([
      {
        playerOne: { id: 'player-one', score: 27 },
        playerTwo: { id: 'player-two', score: 0 }
      }
    ])
    expect(
      gameState.getPlayRejectionReason({
        author: 'player-two',
        column: 0,
        dice: 1
      })
    ).toBe('game-ended')
  })

  it('records an authoritative forfeit outcome', () => {
    const gameState = createGameState()

    expect(gameState.finishByForfeit('player-one')).toBe(true)
    expect(gameState.outcome).toBe('game-ended')
    expect(gameState.finishReason).toBe('forfeit')
    expect(gameState.forfeitReason).toBe('disconnect')
    expect(gameState.winnerId).toBe('player-two')
    expect(gameState.outcomeHistory).toEqual([
      {
        playerOne: { id: 'player-one', score: 0 },
        playerTwo: { id: 'player-two', score: 1 }
      }
    ])
    expect(gameState.finishByForfeit('player-one')).toBe(false)
  })

  it('distinguishes a resignation from a disconnect forfeit', () => {
    const gameState = createGameState()

    expect(gameState.finishByForfeit('player-one', 'resignation')).toBe(true)
    expect(gameState.forfeitReason).toBe('resignation')
    expect(GameState.fromJson(gameState.toJson()).forfeitReason).toBe(
      'resignation'
    )
  })

  it('records a no-contest without a winner or rated history', () => {
    const gameState = createGameState()

    expect(gameState.finishAsNoContest()).toBe(true)
    expect(gameState.outcome).toBe('game-ended')
    expect(gameState.finishReason).toBe('no-contest')
    expect(gameState.winnerId).toBeUndefined()
    expect(gameState.outcomeHistory).toEqual([])
  })
})
