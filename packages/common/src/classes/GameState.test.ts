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
  it('applies a valid move and advances the turn', () => {
    const gameState = createGameState()

    gameState.applyPlay({ author: 'player-one', column: 1, dice: 4 }, false)

    expect(gameState.playerOne.columns).toEqual([[], [4], []])
    expect(gameState.nextPlayer.id).toBe('player-two')
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
})
