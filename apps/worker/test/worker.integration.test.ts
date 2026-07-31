import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestHarness, type TestHarness } from 'wrangler'
import {
  matchmakingStatusSchema,
  playerCredentialsSchema,
  rankedProfileSchema,
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

    const first = await request(
      `/${roomKey}/${playerOne.playerId}/init?boType=1`,
      playerOneRequest
    )
    const replay = await request(
      `/${roomKey}/${playerOne.playerId}/init?boType=1`,
      playerOneRequest
    )
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

describe('ranked matchmaking', () => {
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
    const status = await request(`/matchmaking/${player.playerId}/status`, {
      headers: authorization(player)
    })

    expect(leave.status).toBe(204)
    expect(matchmakingStatusSchema.parse(await status.json())).toEqual({
      status: 'idle'
    })
  })
})
