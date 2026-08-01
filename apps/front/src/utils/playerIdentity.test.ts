import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlayer } from './api'
import {
  ensurePlayerIdentity,
  getStoredPlayerCredentials
} from './playerIdentity'

vi.mock('./api', () => ({ createPlayer: vi.fn() }))
vi.mock('./name', () => ({ randomName: () => 'BraveBlueFox' }))

const credentials = {
  playerId: '22222222-2222-4222-8222-222222222222',
  credential: 'a'.repeat(64)
}

describe('ensurePlayerIdentity', () => {
  beforeEach(() => {
    vi.mocked(createPlayer).mockReset()
  })

  it('creates credentials and a friendly name for a new browser', async () => {
    vi.mocked(createPlayer).mockResolvedValue(credentials)

    await expect(ensurePlayerIdentity()).resolves.toEqual(credentials)
    expect(getStoredPlayerCredentials()).toEqual(credentials)
    expect(localStorage.getItem('displayName')).toBe('BraveBlueFox')
  })

  it('adds a friendly name to an existing UUID identity', async () => {
    localStorage.setItem('playerId', credentials.playerId)
    localStorage.setItem('playerCredential', credentials.credential)

    await ensurePlayerIdentity()

    expect(createPlayer).not.toHaveBeenCalled()
    expect(localStorage.getItem('displayName')).toBe('BraveBlueFox')
  })

  it('preserves a user-selected display name', async () => {
    localStorage.setItem('playerId', credentials.playerId)
    localStorage.setItem('playerCredential', credentials.credential)
    localStorage.setItem('displayName', 'Custom Name')

    await ensurePlayerIdentity()

    expect(localStorage.getItem('displayName')).toBe('Custom Name')
  })
})
