import { describe, expect, it } from 'vitest'
import {
  createIdentityTransferCode,
  parseIdentityTransferCode
} from './playerIdentity'

describe('identity transfer codes', () => {
  it('round-trips an opaque transfer token', () => {
    const token = 'a'.repeat(64)

    expect(parseIdentityTransferCode(createIdentityTransferCode(token))).toBe(
      token
    )
  })

  it('rejects legacy permanent-credential and malformed codes', () => {
    expect(
      parseIdentityTransferCode(
        `knucklebones-player-v1.22222222-2222-4222-8222-222222222222.${'a'.repeat(64)}`
      )
    ).toBeUndefined()
    expect(
      parseIdentityTransferCode('knucklebones-transfer-v1.not-a-token')
    ).toBeUndefined()
  })
})
