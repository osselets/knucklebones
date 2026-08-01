import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from '@knucklebones/common'
import { removeExpiredWebSocketTickets } from '../src/durable-objects/WebSocketDurableObject'

const credentialId = '44444444-4444-4444-8444-444444444444'
const roomKey = '11111111-1111-4111-8111-111111111111'

function ticket(playerId: string, expiresAt: number) {
  return {
    playerId,
    credentialId,
    roomKey,
    protocolVersion: PROTOCOL_VERSION,
    expiresAt
  }
}

describe('removeExpiredWebSocketTickets', () => {
  it('removes tickets at and before their expiry time', () => {
    const expiredHash = 'a'.repeat(64)
    const boundaryHash = 'b'.repeat(64)
    const activeHash = 'c'.repeat(64)
    const playerId = '22222222-2222-4222-8222-222222222222'

    expect(
      removeExpiredWebSocketTickets(
        {
          [expiredHash]: ticket(playerId, 99),
          [boundaryHash]: ticket(playerId, 100),
          [activeHash]: ticket(playerId, 101)
        },
        100
      )
    ).toEqual({
      [activeHash]: ticket(playerId, 101)
    })
  })

  it('removes malformed persisted tickets', () => {
    expect(
      removeExpiredWebSocketTickets(
        {
          malformed: {
            playerId: 'not-a-player-id',
            credentialId,
            roomKey,
            protocolVersion: PROTOCOL_VERSION,
            expiresAt: 101
          }
        },
        100
      )
    ).toEqual({})
  })
})
