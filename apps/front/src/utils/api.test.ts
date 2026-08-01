import { beforeEach, describe, expect, it, vi } from 'vitest'
import { play } from './api'

const room = {
  roomKey: 'room-one',
  playerId: '22222222-2222-4222-8222-222222222222'
}

describe('mutation requests', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem('playerCredential', 'a'.repeat(64))
  })

  it('retries a network failure with the same idempotency key', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await play(room, { column: 1, dice: 4 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<
      string,
      string
    >
    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<
      string,
      string
    >
    expect(firstHeaders['Idempotency-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/
    )
    expect(secondHeaders['Idempotency-Key']).toBe(
      firstHeaders['Idempotency-Key']
    )
  })

  it('does not retry a client error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 409, statusText: 'Conflict' })
    )

    await expect(play(room, { column: 1, dice: 4 })).rejects.toThrow(
      '[409:Conflict]'
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reports a validated API error code and message', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: 'NOT_PLAYER_TURN',
            message: 'It is not your turn.',
            requestId: '33333333-3333-4333-8333-333333333333',
            retryable: false
          }
        },
        { status: 409, statusText: 'Conflict' }
      )
    )

    await expect(play(room, { column: 1, dice: 4 })).rejects.toThrow(
      '[NOT_PLAYER_TURN: It is not your turn.]'
    )
  })

  it('retries a server error with the same idempotency key', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, { status: 503, statusText: 'Unavailable' })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await play(room, { column: 1, dice: 4 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<
      string,
      string
    >
    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<
      string,
      string
    >
    expect(secondHeaders['Idempotency-Key']).toBe(
      firstHeaders['Idempotency-Key']
    )
  })

  it('reports an error after the retry is exhausted', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))

    await expect(play(room, { column: 1, dice: 4 })).rejects.toThrow(
      'There was an error while doing a network call.'
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
