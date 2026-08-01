import { describe, expect, it } from 'vitest'
import { playerCredentialsSchema } from '@knucklebones/common'
import {
  constantTimeEqual,
  createDeviceCredential,
  parseDeviceCredential
} from '../src/utils/credentials'

describe('device credentials', () => {
  it('creates a UUID-addressed credential with a 256-bit secret', async () => {
    const created = await createDeviceCredential()

    expect(
      playerCredentialsSchema.safeParse({
        playerId: '11111111-1111-4111-8111-111111111111',
        credential: created.credential
      }).success
    ).toBe(true)
    expect(parseDeviceCredential(created.credential)).toEqual({
      credentialId: created.credentialId,
      secret: expect.stringMatching(/^[0-9a-f]{64}$/)
    })
    expect(created.secretHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('compares fixed-length verifiers without content-dependent exits', () => {
    expect(constantTimeEqual('a'.repeat(64), 'a'.repeat(64))).toBe(true)
    expect(constantTimeEqual('a'.repeat(64), 'b'.repeat(64))).toBe(false)
  })

  it('keeps legacy secrets readable during migration', () => {
    expect(parseDeviceCredential('a'.repeat(64))).toEqual({
      secret: 'a'.repeat(64)
    })
  })
})
