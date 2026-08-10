import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useGame } from './GameContext'
import { RankedTurnTimer } from './RankedTurnTimer'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key} ${JSON.stringify(values)}`
  })
}))

vi.mock('./GameContext', () => ({
  useGame: vi.fn()
}))

describe('RankedTurnTimer', () => {
  it('renders beside only the player whose turn is active', () => {
    const playerOne = { id: 'player-one' }
    vi.mocked(useGame).mockReturnValue({
      outcome: 'ongoing',
      nextPlayer: playerOne,
      playerOne,
      rankedTurn: {
        expiresAt: Date.now() + 30_000,
        playerOneTimeouts: 1,
        playerTwoTimeouts: 0
      }
    } as never)

    const view = render(<RankedTurnTimer playerId='player-two' />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()

    view.rerender(<RankedTurnTimer playerId='player-one' />)
    expect(
      screen.getByRole('progressbar', { name: 'ranked.turn.time-left' })
    ).toHaveAttribute('aria-valuemax', '30')
    expect(screen.getByText(/ranked.turn.timeouts/)).toHaveTextContent(
      '"count":1'
    )
  })
})
