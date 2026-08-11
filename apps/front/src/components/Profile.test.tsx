import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getRankedProfile, updateRankedProfile } from '../utils/api'
import { ensurePlayerIdentity } from '../utils/playerIdentity'
import { ProfilePage } from './Profile'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))
vi.mock('../utils/api', () => ({
  getRankedProfile: vi.fn(),
  updateRankedProfile: vi.fn()
}))
vi.mock('../utils/playerIdentity', () => ({
  ensurePlayerIdentity: vi.fn()
}))

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.mocked(ensurePlayerIdentity).mockReset().mockResolvedValue({
      playerId: '22222222-2222-4222-8222-222222222222',
      credential: 'credential'
    })
    vi.mocked(getRankedProfile).mockReset().mockResolvedValue({
      playerId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Current Name',
      ratingPool: 'classic',
      rating: 1248,
      gamesPlayed: 14,
      wins: 8,
      losses: 4,
      draws: 2
    })
    vi.mocked(updateRankedProfile).mockReset().mockResolvedValue()
  })

  it('shows ranked statistics and saves a new display name', async () => {
    const user = userEvent.setup()
    render(<ProfilePage />)

    expect(await screen.findByText('1,248')).toBeVisible()
    expect(screen.getByText('8')).toBeVisible()
    expect(screen.getByText('4')).toBeVisible()
    expect(screen.getByText('2')).toBeVisible()

    const nameInput = screen.getByRole('textbox', {
      name: 'profile.name.label'
    })
    await user.clear(nameInput)
    await user.type(nameInput, 'New Name')
    await user.click(screen.getByRole('button', { name: 'profile.name.save' }))

    expect(updateRankedProfile).toHaveBeenCalledWith('New Name')
    expect(
      screen.getByRole('button', { name: 'profile.name.save' })
    ).toBeDisabled()
  })

  it('offers a retry when the profile cannot be loaded', async () => {
    vi.mocked(getRankedProfile)
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({
        playerId: '22222222-2222-4222-8222-222222222222',
        displayName: 'Current Name',
        ratingPool: 'classic',
        rating: 1200,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0
      })
    const user = userEvent.setup()
    render(<ProfilePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('profile.error')
    await user.click(screen.getByRole('button', { name: 'profile.retry' }))

    expect(await screen.findByText('1,200')).toBeVisible()
    expect(getRankedProfile).toHaveBeenCalledTimes(2)
  })
})
