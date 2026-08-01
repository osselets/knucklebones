import { describe, expect, it } from 'vitest'
import { removeExpiredWebSocketTickets } from '../src/durable-objects/WebSocketDurableObject'

describe('removeExpiredWebSocketTickets', () => {
  it('removes tickets at and before their expiry time', () => {
    expect(
      removeExpiredWebSocketTickets(
        {
          expired: { playerId: 'one', expiresAt: 99 },
          boundary: { playerId: 'two', expiresAt: 100 },
          active: { playerId: 'three', expiresAt: 101 }
        },
        100
      )
    ).toEqual({
      active: { playerId: 'three', expiresAt: 101 }
    })
  })
})
