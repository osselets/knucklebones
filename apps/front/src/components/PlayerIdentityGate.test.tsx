import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ensurePlayerIdentity } from '../utils/playerIdentity'
import { PlayerIdentityGate } from './PlayerIdentityGate'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))
vi.mock('../utils/playerIdentity', () => ({ ensurePlayerIdentity: vi.fn() }))

describe('PlayerIdentityGate', () => {
  beforeEach(() => {
    vi.mocked(ensurePlayerIdentity).mockReset()
  })

  it('waits for an identity before rendering application routes', async () => {
    let resolveIdentity: (() => void) | undefined
    vi.mocked(ensurePlayerIdentity).mockReturnValue(
      new Promise((resolve) => {
        resolveIdentity = () =>
          resolve({
            playerId: '22222222-2222-4222-8222-222222222222',
            credential: 'a'.repeat(64)
          })
      })
    )

    render(
      <PlayerIdentityGate>
        <p>application</p>
      </PlayerIdentityGate>
    )

    expect(screen.getByText('identity.loading')).toBeInTheDocument()
    expect(screen.queryByText('application')).not.toBeInTheDocument()

    resolveIdentity?.()

    expect(await screen.findByText('application')).toBeInTheDocument()
  })

  it('offers a retry after identity creation fails', async () => {
    vi.mocked(ensurePlayerIdentity)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        playerId: '22222222-2222-4222-8222-222222222222',
        credential: 'a'.repeat(64)
      })

    render(
      <PlayerIdentityGate>
        <p>application</p>
      </PlayerIdentityGate>
    )

    expect(await screen.findByText('identity.error')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'identity.retry' })
    )

    expect(await screen.findByText('application')).toBeInTheDocument()
    expect(ensurePlayerIdentity).toHaveBeenCalledTimes(2)
  })
})
