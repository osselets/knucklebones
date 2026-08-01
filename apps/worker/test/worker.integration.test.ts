import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestHarness, type TestHarness } from 'wrangler'
import {
  matchmakingStatusSchema,
  playerCredentialsSchema,
  rankedProfileSchema,
  webSocketTicketSchema,
  type PlayerCredentials
} from '@knucklebones/common'

const workerConfigPath = new URL('../wrangler.toml', import.meta.url).pathname

let server: TestHarness

beforeAll(async () => {
  server = createTestHarness({
    workers: [
      {
        configPath: workerConfigPath,
        vars: { SENTRY_DSN: '' }
      }
    ]
  })
  await server.listen()
})

beforeEach(async () => {
  await server.reset()
  await server.getWorker().applyD1Migrations('PLAYERS_DB')
})

afterAll(async () => {
  await server.close()
})

async function request(path: string, init?: RequestInit) {
  return await server.getWorker().fetch(path, init)
}

async function createPlayer(): Promise<PlayerCredentials> {
  const response = await request('/players', { method: 'POST' })
  expect(response.status).toBe(201)
  return playerCredentialsSchema.parse(await response.json())
}

async function setRating(playerId: string, rating: number): Promise<void> {
  const environment = await server.getWorker().getEnv()
  const result = await environment.PLAYERS_DB.prepare(
    'UPDATE player_ratings SET rating = ? WHERE player_id = ?'
  )
    .bind(rating, playerId)
    .run()
  expect(result.meta.changes).toBe(1)
}

function authorization({ credential }: PlayerCredentials): HeadersInit {
  return { Authorization: `Bearer ${credential}` }
}

describe('player identities and ranked profiles', () => {
  it('creates an authenticated UUID identity with a default rating', async () => {
    const player = await createPlayer()

    const response = await request(`/players/${player.playerId}/rating`, {
      headers: authorization(player)
    })

    expect(response.status).toBe(200)
    expect(rankedProfileSchema.parse(await response.json())).toEqual({
      playerId: player.playerId,
      ratingPool: 'classic',
      rating: 1200,
      gamesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0
    })
  })

  it('rejects missing and cross-player credentials without mutating a room', async () => {
    const playerOne = await createPlayer()
    const playerTwo = await createPlayer()
    const roomKey = crypto.randomUUID()
    const path = `/${roomKey}/${playerOne.playerId}/init?boType=1`

    const missingCredential = await request(path, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() }
    })
    expect(missingCredential.status).toBe(401)

    const wrongCredential = await request(path, {
      method: 'POST',
      headers: {
        ...authorization(playerTwo),
        'Idempotency-Key': crypto.randomUUID()
      }
    })
    expect(wrongCredential.status).toBe(403)

    const error = (await wrongCredential.json()) as {
      error: { code: string; requestId: string; retryable: boolean }
    }
    expect(error.error).toMatchObject({
      code: 'PLAYER_ID_MISMATCH',
      retryable: false
    })
    expect(error.error.requestId).toEqual(expect.any(String))
  })

  it('rejects malformed credentials and accepts only the issued secret', async () => {
    const player = await createPlayer()
    const path = `/players/${player.playerId}/verify`

    const missing = await request(path, { method: 'POST' })
    const malformed = await request(path, {
      method: 'POST',
      headers: { Authorization: 'Bearer not-a-credential' }
    })
    const incorrect = await request(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${'b'.repeat(64)}` }
    })
    const valid = await request(path, {
      method: 'POST',
      headers: authorization(player)
    })

    expect(missing.status).toBe(401)
    expect(malformed.status).toBe(401)
    expect(incorrect.status).toBe(401)
    expect(valid.status).toBe(204)
  })
})

describe('atomic idempotent room mutations', () => {
  it('replays the same command and rejects conflicting key reuse', async () => {
    const playerOne = await createPlayer()
    const playerTwo = await createPlayer()
    const roomKey = crypto.randomUUID()
    const mutationId = crypto.randomUUID()
    const playerOneRequest = {
      method: 'POST',
      headers: {
        ...authorization(playerOne),
        'Idempotency-Key': mutationId
      }
    }

    const [first, replay] = await Promise.all([
      request(
        `/${roomKey}/${playerOne.playerId}/init?boType=1`,
        playerOneRequest
      ),
      request(
        `/${roomKey}/${playerOne.playerId}/init?boType=1`,
        playerOneRequest
      )
    ])
    const conflict = await request(`/${roomKey}/${playerTwo.playerId}/init`, {
      method: 'POST',
      headers: {
        ...authorization(playerTwo),
        'Idempotency-Key': mutationId
      }
    })

    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: 'IDEMPOTENCY_KEY_REUSED' }
    })
  })
})

describe('WebSocket tickets', () => {
  it('rejects missing, malformed, and wrong-room tickets', async () => {
    const player = await createPlayer()
    const roomKey = crypto.randomUUID()
    const ticketResponse = await request(
      `/${roomKey}/${player.playerId}/websocket-ticket`,
      { method: 'POST', headers: authorization(player) }
    )
    const { ticket } = webSocketTicketSchema.parse(await ticketResponse.json())

    const missing = await request(`/${roomKey}/websocket`, {
      headers: { Upgrade: 'websocket' }
    })
    const malformed = await request(
      `/${roomKey}/websocket?ticket=not-a-ticket`,
      { headers: { Upgrade: 'websocket' } }
    )
    const wrongRoom = await request(
      `/${crypto.randomUUID()}/websocket?ticket=${ticket}`,
      { headers: { Upgrade: 'websocket' } }
    )

    expect(missing.status).toBe(401)
    expect(malformed.status).toBe(401)
    expect(wrongRoom.status).toBe(401)
  })
})

describe('ranked matchmaking', () => {
  it('keeps both players waiting during the fast selection window', async () => {
    const playerOne = await createPlayer()
    const playerTwo = await createPlayer()

    const [playerOneJoin, playerTwoJoin] = await Promise.all([
      request(`/matchmaking/${playerOne.playerId}/join`, {
        method: 'POST',
        headers: authorization(playerOne)
      }),
      request(`/matchmaking/${playerTwo.playerId}/join`, {
        method: 'POST',
        headers: authorization(playerTwo)
      })
    ])

    expect(
      matchmakingStatusSchema.parse(await playerOneJoin.json()).status
    ).toBe('waiting')
    expect(
      matchmakingStatusSchema.parse(await playerTwoJoin.json()).status
    ).toBe('waiting')
  })

  it('does not reset the selection window when a player joins twice', async () => {
    const player = await createPlayer()

    const first = matchmakingStatusSchema.parse(
      await (
        await request(`/matchmaking/${player.playerId}/join`, {
          method: 'POST',
          headers: authorization(player)
        })
      ).json()
    )
    const duplicate = matchmakingStatusSchema.parse(
      await (
        await request(`/matchmaking/${player.playerId}/join`, {
          method: 'POST',
          headers: authorization(player)
        })
      ).json()
    )

    expect(first.status).toBe('waiting')
    expect(duplicate).toEqual(first)
  })

  it('assigns two waiting players to the same BO1 room', async () => {
    const playerOne = await createPlayer()
    const playerTwo = await createPlayer()

    const firstJoin = await request(`/matchmaking/${playerOne.playerId}/join`, {
      method: 'POST',
      headers: authorization(playerOne)
    })
    expect(matchmakingStatusSchema.parse(await firstJoin.json()).status).toBe(
      'waiting'
    )

    await new Promise((resolve) => setTimeout(resolve, 800))

    const secondJoin = await request(
      `/matchmaking/${playerTwo.playerId}/join`,
      { method: 'POST', headers: authorization(playerTwo) }
    )
    const playerOneStatus = await request(
      `/matchmaking/${playerOne.playerId}/status`,
      { headers: authorization(playerOne) }
    )
    const playerTwoMatch = matchmakingStatusSchema.parse(
      await secondJoin.json()
    )
    const playerOneMatch = matchmakingStatusSchema.parse(
      await playerOneStatus.json()
    )

    expect(playerOneMatch.status).toBe('matched')
    expect(playerTwoMatch.status).toBe('matched')
    if (
      playerOneMatch.status !== 'matched' ||
      playerTwoMatch.status !== 'matched'
    ) {
      throw new Error('Expected both players to be matched.')
    }
    expect(playerOneMatch.match).toEqual(playerTwoMatch.match)
    expect(playerOneMatch.match).toMatchObject({
      ratingPool: 'classic',
      format: 'bo1',
      playerOneId: playerOne.playerId,
      playerTwoId: playerTwo.playerId
    })
  })

  it('removes a waiting player from the queue', async () => {
    const player = await createPlayer()

    await request(`/matchmaking/${player.playerId}/join`, {
      method: 'POST',
      headers: authorization(player)
    })
    const leave = await request(`/matchmaking/${player.playerId}/queue`, {
      method: 'DELETE',
      headers: authorization(player)
    })
    const duplicateLeave = await request(
      `/matchmaking/${player.playerId}/queue`,
      { method: 'DELETE', headers: authorization(player) }
    )
    const status = await request(`/matchmaking/${player.playerId}/status`, {
      headers: authorization(player)
    })

    expect(leave.status).toBe(204)
    expect(duplicateLeave.status).toBe(204)
    expect(matchmakingStatusSchema.parse(await status.json())).toEqual({
      status: 'idle'
    })

    const rejoin = await request(`/matchmaking/${player.playerId}/join`, {
      method: 'POST',
      headers: authorization(player)
    })
    expect(matchmakingStatusSchema.parse(await rejoin.json()).status).toBe(
      'waiting'
    )
  })

  it('chooses the closest rating after the selection window', async () => {
    const player = await createPlayer()
    const distantOpponent = await createPlayer()
    const closeOpponent = await createPlayer()
    await setRating(player.playerId, 1200)
    await setRating(distantOpponent.playerId, 1800)
    await setRating(closeOpponent.playerId, 1225)

    const joinResponses = await Promise.all(
      [player, distantOpponent, closeOpponent].map(async (candidate) =>
        request(`/matchmaking/${candidate.playerId}/join`, {
          method: 'POST',
          headers: authorization(candidate)
        })
      )
    )
    for (const response of joinResponses) {
      expect(matchmakingStatusSchema.parse(await response.json()).status).toBe(
        'waiting'
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 800))
    const response = await request(`/matchmaking/${player.playerId}/status`, {
      headers: authorization(player)
    })
    const match = matchmakingStatusSchema.parse(await response.json())

    expect(match.status).toBe('matched')
    if (match.status !== 'matched') {
      throw new Error('Expected the player to be matched.')
    }
    expect([match.match.playerOneId, match.match.playerTwoId]).toEqual([
      player.playerId,
      closeOpponent.playerId
    ])
  })

  it('falls back to a distant opponent instead of waiting indefinitely', async () => {
    const player = await createPlayer()
    const opponent = await createPlayer()
    await setRating(player.playerId, 800)
    await setRating(opponent.playerId, 2400)

    await Promise.all(
      [player, opponent].map(async (candidate) =>
        request(`/matchmaking/${candidate.playerId}/join`, {
          method: 'POST',
          headers: authorization(candidate)
        })
      )
    )

    await new Promise((resolve) => setTimeout(resolve, 800))
    const response = await request(`/matchmaking/${player.playerId}/status`, {
      headers: authorization(player)
    })

    expect(matchmakingStatusSchema.parse(await response.json()).status).toBe(
      'matched'
    )
  })
})
