import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWebSocketTicket,
  getMatchmakingStatus,
  getRankedProfile,
  initGame,
  joinMatchmaking,
  leaveMatchmaking,
  play,
  updateDisplayName,
  voteRematch
} from './api'

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

    await play(room, { column: 1 })

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
    expect(fetchMock.mock.calls[0][0]).toContain(
      `/v1/rooms/${room.roomKey}/play`
    )
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"column":1}')
  })

  it('does not retry a client error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 409, statusText: 'Conflict' })
    )

    await expect(play(room, { column: 1 })).rejects.toThrow('[409:Conflict]')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('uses authenticated versioned room endpoints without player IDs', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          ticket: 'a'.repeat(64),
          expiresAt: Date.now() + 30_000
        })
      )
    localStorage.setItem('displayName', 'Dice Friend')

    await initGame(room, { playerType: 'human', boType: 1 })
    await voteRematch(room, { boType: 3 })
    await updateDisplayName(room, { displayName: 'A/B ? Player' })
    await createWebSocketTicket(room)

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining(`/v1/rooms/${room.roomKey}/init`),
      expect.stringContaining(`/v1/rooms/${room.roomKey}/rematch`),
      expect.stringContaining(`/v1/rooms/${room.roomKey}/display-name`),
      expect.stringContaining(`/v1/rooms/${room.roomKey}/websocket-ticket`)
    ])
    expect(
      fetchMock.mock.calls.every(
        ([url]) => !url.toString().includes(room.playerId)
      )
    ).toBe(true)
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      '{"playerType":"human","boType":1,"displayName":"Dice Friend"}'
    )
    expect(fetchMock.mock.calls[1][1]?.body).toBe('{"boType":3}')
    expect(fetchMock.mock.calls[2][1]?.body).toBe(
      '{"displayName":"A/B ? Player"}'
    )
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

    await expect(play(room, { column: 1 })).rejects.toThrow(
      '[NOT_PLAYER_TURN: It is not your turn.]'
    )
  })

  it('retries a server error with the same idempotency key', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, { status: 503, statusText: 'Unavailable' })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await play(room, { column: 1 })

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

    await expect(play(room, { column: 1 })).rejects.toThrow(
      'There was an error while doing a network call.'
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses authenticated ranked profile and matchmaking endpoints', async () => {
    const joinedAt = Date.now()
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          playerId: room.playerId,
          ratingPool: 'classic',
          rating: 1200,
          gamesPlayed: 0,
          wins: 0,
          draws: 0,
          losses: 0
        })
      )
      .mockResolvedValueOnce(Response.json({ status: 'waiting', joinedAt }))
      .mockResolvedValueOnce(Response.json({ status: 'waiting', joinedAt }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(getRankedProfile()).resolves.toMatchObject({ rating: 1200 })
    await expect(joinMatchmaking()).resolves.toEqual({
      status: 'waiting',
      joinedAt
    })
    await expect(getMatchmakingStatus()).resolves.toEqual({
      status: 'waiting',
      joinedAt
    })
    await leaveMatchmaking()

    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, init?.method])
    ).toEqual([
      [expect.stringContaining('/v1/ranked/profile'), 'GET'],
      [expect.stringContaining('/v1/matchmaking/join'), 'POST'],
      [expect.stringContaining('/v1/matchmaking/status'), 'GET'],
      [expect.stringContaining('/v1/matchmaking/queue'), 'DELETE']
    ])
  })
})
