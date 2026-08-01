import { describe, expect, it } from 'vitest'
import { removeExpiredWebSocketTickets } from '../src/durable-objects/WebSocketDurableObject'

describe('removeExpiredWebSocketTickets', () => {
  it('removes tickets at and before their expiry time', () => {
    const expiredHash = 'a'.repeat(64)
    const boundaryHash = 'b'.repeat(64)
    const activeHash = 'c'.repeat(64)
    const playerId = '22222222-2222-4222-8222-222222222222'

    expect(
      removeExpiredWebSocketTickets(
        {
          [expiredHash]: { playerId, expiresAt: 99 },
          [boundaryHash]: { playerId, expiresAt: 100 },
          [activeHash]: { playerId, expiresAt: 101 }
        },
        100
      )
    ).toEqual({
      [activeHash]: { playerId, expiresAt: 101 }
    })
  })

  it('removes malformed persisted tickets', () => {
    expect(
      removeExpiredWebSocketTickets(
        {
          malformed: {
            playerId: 'not-a-player-id',
            expiresAt: 101
          }
        },
        100
      )
    ).toEqual({})
  })
})
