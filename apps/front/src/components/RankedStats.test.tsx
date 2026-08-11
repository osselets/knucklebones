import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getRankedStats } from '../utils/api'
import { RankedStatsPage } from './RankedStats'

vi.mock('../utils/api', () => ({ getRankedStats: vi.fn() }))

describe('RankedStatsPage', () => {
  beforeEach(() => {
    vi.mocked(getRankedStats).mockReset()
    vi.mocked(getRankedStats).mockResolvedValue({
      generatedAt: Date.UTC(2026, 7, 11, 12),
      totals: {
        players: 125,
        matches: 48,
        wins: 42,
        draws: 12,
        losses: 42,
        averageEloGain: 14.5
      },
      current: { activePlayers: 8, queuedPlayers: 3 },
      history: {
        players: [
          { timestamp: Date.UTC(2026, 7, 10), value: 120 },
          { timestamp: Date.UTC(2026, 7, 11), value: 125 }
        ],
        queue: [
          { timestamp: Date.UTC(2026, 7, 11, 11), value: 1 },
          { timestamp: Date.UTC(2026, 7, 11, 12), value: 3 }
        ]
      }
    })
  })

  it('shows aggregate and live values and marks the page as noindex', async () => {
    const view = render(<RankedStatsPage />)

    expect(await screen.findByText('ranked.stats.title')).toBeVisible()
    expect(screen.getByText('125')).toBeVisible()
    expect(screen.getByText('48')).toBeVisible()
    expect(screen.getByText('14.5')).toBeVisible()
    expect(screen.getByText('8')).toBeVisible()
    expect(screen.getByText('3')).toBeVisible()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )

    view.unmount()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
