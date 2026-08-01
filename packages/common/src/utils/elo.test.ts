import { describe, expect, it } from 'vitest'
import { calculateEloRatings } from './elo'

describe('calculateEloRatings', () => {
  it('moves sixteen points between equally rated players after a decisive game', () => {
    expect(calculateEloRatings(1200, 1200, 'player-one-win')).toEqual({
      playerOne: { before: 1200, after: 1216, change: 16 },
      playerTwo: { before: 1200, after: 1184, change: -16 }
    })
  })

  it('does not change equal ratings after a draw', () => {
    expect(calculateEloRatings(1200, 1200, 'draw')).toEqual({
      playerOne: { before: 1200, after: 1200, change: 0 },
      playerTwo: { before: 1200, after: 1200, change: 0 }
    })
  })

  it('keeps every rating update zero-sum', () => {
    const update = calculateEloRatings(1000, 1600, 'player-one-win')

    expect(update.playerOne.change).toBeGreaterThan(16)
    expect(update.playerOne.change + update.playerTwo.change).toBe(0)
  })
})
