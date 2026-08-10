import { describe, expect, it } from 'vitest'
import { calculateEloRatings, roundEloChange } from './elo'

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

  it('produces the same changes when player seats are swapped', () => {
    const original = calculateEloRatings(1000, 1600, 'player-one-win')
    const swapped = calculateEloRatings(1600, 1000, 'player-two-win')

    expect(swapped.playerTwo.change).toBe(original.playerOne.change)
    expect(swapped.playerOne.change).toBe(original.playerTwo.change)
  })
})

describe('roundEloChange', () => {
  it('rounds positive and negative halves symmetrically', () => {
    expect(roundEloChange(4.5)).toBe(5)
    expect(roundEloChange(-4.5)).toBe(-5)
  })

  it('returns positive zero for changes below half a point', () => {
    expect(roundEloChange(0.49)).toBe(0)
    expect(roundEloChange(-0.49)).toBe(0)
    expect(Object.is(roundEloChange(-0.49), -0)).toBe(false)
  })
})
