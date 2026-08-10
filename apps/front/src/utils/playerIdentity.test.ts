import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, createPlayer, verifyPlayer } from './api'
import {
  ensurePlayerIdentity,
  getStoredPlayerCredentials
} from './playerIdentity'

vi.mock('./api', () => ({
  ApiRequestError: class extends Error {
    status: number

    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
  createPlayer: vi.fn(),
  verifyPlayer: vi.fn()
}))
vi.mock('./name', () => ({ randomName: () => 'BraveBlueFox' }))

const credentials = {
  playerId: '22222222-2222-4222-8222-222222222222',
  credential: 'a'.repeat(64)
}
const bootstrap = {
  ...credentials,
  recoveryPhrase:
    'knucklebones-recovery-v1.aaaa.aaaa.aaaa.aaaa.aaaa.aaaa.aaaa.aaaa'
}

describe('ensurePlayerIdentity', () => {
  beforeEach(() => {
    vi.mocked(createPlayer).mockReset()
    vi.mocked(verifyPlayer).mockReset()
    vi.mocked(verifyPlayer).mockResolvedValue()
  })

  it('creates credentials and a friendly name for a new browser', async () => {
    vi.mocked(createPlayer).mockResolvedValue(bootstrap)

    await expect(ensurePlayerIdentity()).resolves.toEqual(bootstrap)
    expect(getStoredPlayerCredentials()).toEqual(credentials)
    expect(
      localStorage.getItem('knucklebones.identity.v1.pendingRecoveryPhrase')
    ).toBe(bootstrap.recoveryPhrase)
    expect(localStorage.getItem('knucklebones.identity.v1.displayName')).toBe(
      'BraveBlueFox'
    )
  })

  it('adds a friendly name to an existing UUID identity', async () => {
    localStorage.setItem('playerId', credentials.playerId)
    localStorage.setItem('playerCredential', credentials.credential)

    await ensurePlayerIdentity()

    expect(createPlayer).not.toHaveBeenCalled()
    expect(localStorage.getItem('knucklebones.identity.v1.displayName')).toBe(
      'BraveBlueFox'
    )
    expect(localStorage.getItem('playerId')).toBeNull()
    expect(localStorage.getItem('playerCredential')).toBeNull()
  })

  it('preserves a user-selected display name', async () => {
    localStorage.setItem('playerId', credentials.playerId)
    localStorage.setItem('playerCredential', credentials.credential)
    localStorage.setItem('displayName', 'Custom Name')

    await ensurePlayerIdentity()

    expect(localStorage.getItem('knucklebones.identity.v1.displayName')).toBe(
      'Custom Name'
    )
  })

  it('replaces a stale local credential after the development database resets', async () => {
    localStorage.setItem(
      'knucklebones.identity.v1.playerId',
      credentials.playerId
    )
    localStorage.setItem(
      'knucklebones.identity.v1.deviceCredential',
      credentials.credential
    )
    localStorage.setItem(
      'knucklebones.identity.v1.pendingRecoveryPhrase',
      'stale recovery phrase'
    )
    vi.mocked(verifyPlayer).mockRejectedValue(
      new ApiRequestError(401, 'Invalid local credential')
    )
    const replacement = {
      ...bootstrap,
      playerId: '33333333-3333-4333-8333-333333333333',
      credential: 'b'.repeat(64)
    }
    vi.mocked(createPlayer).mockResolvedValue(replacement)

    await expect(ensurePlayerIdentity()).resolves.toEqual(replacement)
    expect(getStoredPlayerCredentials()).toEqual({
      playerId: replacement.playerId,
      credential: replacement.credential
    })
    expect(
      localStorage.getItem('knucklebones.identity.v1.pendingRecoveryPhrase')
    ).toBe(replacement.recoveryPhrase)
  })
})
