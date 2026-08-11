import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getRankedLeaderboard } from '../utils/api'
import { LeaderboardPage } from './Leaderboard'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))
vi.mock('../utils/api', () => ({ getRankedLeaderboard: vi.fn() }))

const topPlayers = Array.from({ length: 10 }, (_, index) => ({
  rank: index + 1,
  playerId: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
  displayName: index === 0 ? 'Champion 🧙' : `Player ${index + 1}`,
  rating: 1500 - index * 20
}))

describe('LeaderboardPage', () => {
  beforeEach(() => {
    vi.mocked(getRankedLeaderboard)
      .mockReset()
      .mockResolvedValue({
        topPlayers,
        currentPlayer: {
          rank: 24,
          playerId: '99999999-1111-4111-8111-111111111111',
          displayName: 'Current Player',
          rating: 1160
        }
      })
  })

  it('shows the podium, top ten, and current player position', async () => {
    render(<LeaderboardPage />)

    expect(await screen.findByText('leaderboard.title')).toBeVisible()
    expect(screen.getAllByText('Champion 🧙')).toHaveLength(2)
    expect(screen.getByText('Player 10')).toBeVisible()
    expect(screen.getByText('Current Player')).toBeVisible()
    expect(screen.getByText('#24')).toBeVisible()
  })

  it('offers a retry after a load failure', async () => {
    vi.mocked(getRankedLeaderboard)
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({
        topPlayers: [],
        currentPlayer: {
          rank: null,
          playerId: '99999999-1111-4111-8111-111111111111',
          displayName: 'New Player',
          rating: 1200
        }
      })
    const user = userEvent.setup()
    render(<LeaderboardPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'leaderboard.error'
    )
    await user.click(screen.getByRole('button', { name: 'leaderboard.retry' }))

    expect(await screen.findByText('leaderboard.empty')).toBeVisible()
    expect(screen.getByText('leaderboard.unranked')).toBeVisible()
  })
})
