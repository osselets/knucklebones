import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestHarness, type TestHarness } from 'wrangler'
import {
  apiErrorBodySchema,
  deviceCredentialListSchema,
  identityRecoverySchema,
  identityTransferSchema,
  matchmakingStatusSchema,
  playerCredentialsSchema,
  playerIdentityBootstrapSchema,
  type PresenceUpdateResult,
  rankedProfileSchema,
  webSocketTicketSchema,
  type PlayerCredentials
} from '@knucklebones/common'
import {
  createDeviceCredential,
  hashCredential
} from '../src/utils/credentials'

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

describe('environment request policy', () => {
  it('emits CORS headers only for an allowed frontend origin', async () => {
    const allowed = await request('/missing', {
      headers: { Origin: 'http://localhost:5173' }
    })
    const blocked = await request('/missing', {
      headers: { Origin: 'https://attacker.example' }
    })
    const preflight = await request('/players', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:4173',
        'Access-Control-Request-Method': 'POST'
      }
    })

    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:5173'
    )
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://127.0.0.1:4173'
    )
  })
})

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

describe('device credential lifecycle', () => {
  it('authenticates a migrated legacy credential', async () => {
    const player = await createPlayer()
    const legacyCredential = 'b'.repeat(64)
    const environment = await server.getWorker().getEnv()
    await environment.PLAYERS_DB.prepare(
      `INSERT INTO device_credentials
        (credential_id, player_id, secret_hash, created_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        player.playerId,
        await hashCredential(legacyCredential),
        Date.now()
      )
      .run()

    const verification = await request(`/players/${player.playerId}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${legacyCredential}` }
    })

    expect(verification.status).toBe(204)
  })

  it('rotates the current credential and rejects the revoked secret', async () => {
    const player = await createPlayer()
    expect(player.credential).toMatch(/^[0-9a-f-]{36}_[0-9a-f]{64}$/)

    const initialList = await request('/v1/identity/credentials', {
      headers: authorization(player)
    })
    expect(initialList.status).toBe(200)
    expect(deviceCredentialListSchema.parse(await initialList.json())).toEqual([
      expect.objectContaining({ current: true })
    ])

    const rotation = await request('/v1/identity/credentials/rotate', {
      method: 'POST',
      headers: authorization(player)
    })
    expect(rotation.status).toBe(201)
    const rotated = playerCredentialsSchema.parse(await rotation.json())

    const revokedVerification = await request(
      `/players/${player.playerId}/verify`,
      { method: 'POST', headers: authorization(player) }
    )
    const rotatedVerification = await request(
      `/players/${player.playerId}/verify`,
      { method: 'POST', headers: authorization(rotated) }
    )

    expect(revokedVerification.status).toBe(401)
    expect(rotatedVerification.status).toBe(204)
  })

  it('revokes every other active device without revoking the caller', async () => {
    const player = await createPlayer()
    const otherDevice = await createDeviceCredential()
    const environment = await server.getWorker().getEnv()
    await environment.PLAYERS_DB.prepare(
      `INSERT INTO device_credentials
        (credential_id, player_id, secret_hash, created_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind(
        otherDevice.credentialId,
        player.playerId,
        otherDevice.secretHash,
        Date.now()
      )
      .run()

    const revoke = await request('/v1/identity/credentials/revoke-others', {
      method: 'POST',
      headers: authorization(player)
    })
    const currentVerification = await request(
      `/players/${player.playerId}/verify`,
      { method: 'POST', headers: authorization(player) }
    )
    const otherVerification = await request(
      `/players/${player.playerId}/verify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${otherDevice.credential}`
        }
      }
    )

    expect(revoke.status).toBe(204)
    expect(currentVerification.status).toBe(204)
    expect(otherVerification.status).toBe(401)
  })

  it('revokes a selected device but protects the current credential', async () => {
    const player = await createPlayer()
    const otherDevice = await createDeviceCredential()
    const [currentCredentialId] = player.credential.split('_')
    const environment = await server.getWorker().getEnv()
    await environment.PLAYERS_DB.prepare(
      `INSERT INTO device_credentials
        (credential_id, player_id, secret_hash, created_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind(
        otherDevice.credentialId,
        player.playerId,
        otherDevice.secretHash,
        Date.now()
      )
      .run()

    const currentRevoke = await request(
      `/v1/identity/credentials/${currentCredentialId}`,
      { method: 'DELETE', headers: authorization(player) }
    )
    const otherRevoke = await request(
      `/v1/identity/credentials/${otherDevice.credentialId}`,
      { method: 'DELETE', headers: authorization(player) }
    )
    const otherVerification = await request(
      `/players/${player.playerId}/verify`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherDevice.credential}` }
      }
    )

    expect(currentRevoke.status).toBe(409)
    expect(otherRevoke.status).toBe(204)
    expect(otherVerification.status).toBe(401)
  })
})

describe('one-time identity transfers', () => {
  async function issueTransfer(player: PlayerCredentials) {
    const response = await request('/v1/identity/transfers', {
      method: 'POST',
      headers: authorization(player)
    })
    expect(response.status).toBe(201)
    return identityTransferSchema.parse(await response.json())
  }

  async function redeemTransfer(
    transferToken: string,
    revokeOtherDevices = false
  ) {
    return await request('/v1/identity/transfers/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferToken, revokeOtherDevices })
    })
  }

  it('issues a separate device credential for the same player', async () => {
    const source = await createPlayer()
    const transfer = await issueTransfer(source)
    const response = await redeemTransfer(transfer.transferToken)

    expect(response.status).toBe(201)
    const imported = playerCredentialsSchema.parse(await response.json())
    expect(imported.playerId).toBe(source.playerId)
    expect(imported.credential).not.toBe(source.credential)

    const [sourceVerification, importedVerification] = await Promise.all([
      request(`/players/${source.playerId}/verify`, {
        method: 'POST',
        headers: authorization(source)
      }),
      request(`/players/${imported.playerId}/verify`, {
        method: 'POST',
        headers: authorization(imported)
      })
    ])
    expect(sourceVerification.status).toBe(204)
    expect(importedVerification.status).toBe(204)
  })

  it('allows only one of two concurrent redemptions', async () => {
    const source = await createPlayer()
    const transfer = await issueTransfer(source)

    const responses = await Promise.all([
      redeemTransfer(transfer.transferToken),
      redeemTransfer(transfer.transferToken)
    ])

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 410])
  })

  it('rejects an expired transfer token', async () => {
    const source = await createPlayer()
    const transfer = await issueTransfer(source)
    const environment = await server.getWorker().getEnv()
    await environment.PLAYERS_DB.prepare(
      'UPDATE identity_transfers SET expires_at = ? WHERE player_id = ?'
    )
      .bind(Date.now() - 1, source.playerId)
      .run()

    const response = await redeemTransfer(transfer.transferToken)

    expect(response.status).toBe(410)
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe(
      'IDENTITY_TRANSFER_UNAVAILABLE'
    )
  })

  it('can revoke source devices as part of redemption', async () => {
    const source = await createPlayer()
    const transfer = await issueTransfer(source)
    const response = await redeemTransfer(transfer.transferToken, true)
    const imported = playerCredentialsSchema.parse(await response.json())

    const [sourceVerification, importedVerification] = await Promise.all([
      request(`/players/${source.playerId}/verify`, {
        method: 'POST',
        headers: authorization(source)
      }),
      request(`/players/${imported.playerId}/verify`, {
        method: 'POST',
        headers: authorization(imported)
      })
    ])
    expect(sourceVerification.status).toBe(401)
    expect(importedVerification.status).toBe(204)
  })
})

describe('identity recovery', () => {
  async function createRecoveryIdentity() {
    const response = await request('/players', { method: 'POST' })
    expect(response.status).toBe(201)
    return playerIdentityBootstrapSchema.parse(await response.json())
  }

  async function redeemRecovery(
    recoveryPhrase: string,
    revokeOtherDevices = false
  ) {
    return await request('/v1/identity/recovery/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recoveryPhrase, revokeOtherDevices })
    })
  }

  it('stores only a verifier for the initial 128-bit recovery phrase', async () => {
    const identity = await createRecoveryIdentity()
    const environment = await server.getWorker().getEnv()
    const recovery = await environment.PLAYERS_DB.prepare(
      'SELECT verifier_hash FROM recovery_credentials WHERE player_id = ?'
    )
      .bind(identity.playerId)
      .first<{ verifier_hash: string }>()

    expect(identity.recoveryPhrase).toMatch(
      /^knucklebones-recovery-v1(?:\.[0-9a-f]{4}){8}$/
    )
    expect(recovery?.verifier_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(recovery?.verifier_hash).not.toContain(identity.recoveryPhrase)
  })

  it('atomically recovers once and rotates the phrase', async () => {
    const source = await createRecoveryIdentity()
    const responses = await Promise.all([
      redeemRecovery(source.recoveryPhrase.toUpperCase()),
      redeemRecovery(source.recoveryPhrase)
    ])

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 410])
    const success = responses.find(({ status }) => status === 201)!
    const recovered = identityRecoverySchema.parse(await success.json())
    expect(recovered.playerId).toBe(source.playerId)
    expect(recovered.credential).not.toBe(source.credential)
    expect(recovered.recoveryPhrase).not.toBe(source.recoveryPhrase)

    const replay = await redeemRecovery(source.recoveryPhrase)
    expect(replay.status).toBe(410)

    const replacement = await redeemRecovery(recovered.recoveryPhrase)
    expect(replacement.status).toBe(201)
  })

  it('regenerates recovery for an authenticated existing device', async () => {
    const source = await createRecoveryIdentity()
    const rotation = await request('/v1/identity/recovery/rotate', {
      method: 'POST',
      headers: authorization(source)
    })
    expect(rotation.status).toBe(201)

    const oldRecovery = await redeemRecovery(source.recoveryPhrase)
    const sourceVerification = await request(
      `/players/${source.playerId}/verify`,
      { method: 'POST', headers: authorization(source) }
    )
    expect(oldRecovery.status).toBe(410)
    expect(sourceVerification.status).toBe(204)
  })

  it('can revoke all source devices while recovering', async () => {
    const source = await createRecoveryIdentity()
    const response = await redeemRecovery(source.recoveryPhrase, true)
    const recovered = identityRecoverySchema.parse(await response.json())

    const [sourceVerification, recoveredVerification] = await Promise.all([
      request(`/players/${source.playerId}/verify`, {
        method: 'POST',
        headers: authorization(source)
      }),
      request(`/players/${recovered.playerId}/verify`, {
        method: 'POST',
        headers: authorization(recovered)
      })
    ])
    expect(sourceVerification.status).toBe(401)
    expect(recoveredVerification.status).toBe(204)
  })

  it('rate-limits repeated recovery attempts by client address', async () => {
    const recoveryPhrase =
      'knucklebones-recovery-v1.bbbb.bbbb.bbbb.bbbb.bbbb.bbbb.bbbb.bbbb'
    const makeAttempt = (clientAddress: string) =>
      request('/v1/identity/recovery/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': clientAddress
        },
        body: JSON.stringify({ recoveryPhrase })
      })

    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await makeAttempt('192.0.2.1')).status).toBe(410)
    }

    const limited = await makeAttempt('192.0.2.1')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toMatch(/^\d+$/)
    expect(apiErrorBodySchema.parse(await limited.json()).error).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true
    })

    expect((await makeAttempt('192.0.2.2')).status).toBe(410)
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

describe('versioned authenticated room API', () => {
  function mutationRequest(
    player: PlayerCredentials,
    body?: unknown
  ): RequestInit {
    return {
      method: 'POST',
      headers: {
        ...authorization(player),
        'Idempotency-Key': crypto.randomUUID(),
        ...(body !== undefined && { 'Content-Type': 'application/json' })
      },
      ...(body !== undefined && { body: JSON.stringify(body) })
    }
  }

  it('derives room actors from credentials and accepts settings in JSON', async () => {
    const playerOne = await createPlayer()
    const playerTwo = await createPlayer()
    const roomKey = crypto.randomUUID()

    const first = await request(
      `/v1/rooms/${roomKey}/init`,
      mutationRequest(playerOne, {
        playerType: 'human',
        displayName: 'Player / One?',
        boType: 1
      })
    )
    const second = await request(
      `/v1/rooms/${roomKey}/init`,
      mutationRequest(playerTwo, { playerType: 'human', boType: 1 })
    )
    const renamed = await request(
      `/v1/rooms/${roomKey}/display-name`,
      mutationRequest(playerOne, { displayName: 'Updated / Name?' })
    )
    const ticket = await request(
      `/v1/rooms/${roomKey}/websocket-ticket`,
      mutationRequest(playerOne)
    )

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(renamed.status).toBe(200)
    expect(ticket.status).toBe(201)
    expect(webSocketTicketSchema.safeParse(await ticket.json()).success).toBe(
      true
    )
  })

  it('rejects malformed or identity-bearing room bodies', async () => {
    const player = await createPlayer()
    const roomKey = crypto.randomUUID()

    for (const body of [
      { playerType: 'human', playerId: player.playerId },
      { playerType: 'ai' },
      { playerType: 'human', boType: 2 }
    ]) {
      const response = await request(
        `/v1/rooms/${roomKey}/init`,
        mutationRequest(player, body)
      )
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'INVALID_INITIALIZE_GAME_REQUEST' }
      })
    }
  })

  it('rejects rematch votes from authenticated spectators', async () => {
    const playerOne = await createPlayer()
    const playerTwo = await createPlayer()
    const spectator = await createPlayer()
    const roomKey = crypto.randomUUID()

    for (const player of [playerOne, playerTwo]) {
      expect(
        (
          await request(
            `/v1/rooms/${roomKey}/init`,
            mutationRequest(player, { playerType: 'human', boType: 1 })
          )
        ).status
      ).toBe(200)
    }

    const environment = await server.getWorker().getEnv()
    const durableObjectId =
      environment.GAME_STATE_DURABLE_OBJECT.idFromName(roomKey)
    const game = environment.GAME_STATE_DURABLE_OBJECT.get(durableObjectId)
    const callGame = async (method: string, args: unknown[]) => {
      const response = await game.fetch(
        `https://itty-durable/do/call/${method}`,
        {
          headers: {
            'do-name': roomKey,
            'do-content': JSON.stringify(args)
          }
        }
      )
      expect(response.ok).toBe(true)
      return response
    }
    const now = Date.now() + 60_000
    await callGame('configureDisconnectPolicy', [roomKey, 100])
    await callGame('updatePresence', [playerOne.playerId, true, now])
    await callGame('updatePresence', [playerTwo.playerId, true, now])
    await callGame('updatePresence', [playerOne.playerId, false, now])
    await callGame('adjudicateDisconnects', [now + 100])

    const rematch = await request(
      `/v1/rooms/${roomKey}/rematch`,
      mutationRequest(spectator, {})
    )
    const displayName = await request(
      `/v1/rooms/${roomKey}/display-name`,
      mutationRequest(spectator, { displayName: 'Intruder' })
    )

    expect(rematch.status).toBe(403)
    await expect(rematch.json()).resolves.toMatchObject({
      error: { code: 'NOT_A_PLAYER' }
    })
    expect(displayName.status).toBe(403)
    await expect(displayName.json()).resolves.toMatchObject({
      error: { code: 'NOT_A_PLAYER' }
    })
  })
})

describe('ranked disconnect adjudication', () => {
  async function createActiveRoom() {
    const playerOne = await createPlayer()
    const playerTwo = await createPlayer()
    const roomKey = crypto.randomUUID()

    for (const player of [playerOne, playerTwo]) {
      const response = await request(`/${roomKey}/${player.playerId}/init`, {
        method: 'POST',
        headers: {
          ...authorization(player),
          'Idempotency-Key': crypto.randomUUID()
        }
      })
      expect(response.status).toBe(200)
    }

    const environment = await server.getWorker().getEnv()
    const durableObjectId =
      environment.GAME_STATE_DURABLE_OBJECT.idFromName(roomKey)
    const game = environment.GAME_STATE_DURABLE_OBJECT.get(durableObjectId)
    const callGame = async <T>(method: string, args: unknown[]): Promise<T> => {
      const response = await game.fetch(
        `https://itty-durable/do/call/${method}`,
        {
          headers: {
            'do-name': roomKey,
            'do-content': JSON.stringify(args)
          }
        }
      )
      expect(response.ok).toBe(true)
      return (response.status === 204 ? undefined : await response.json()) as T
    }
    await callGame('configureDisconnectPolicy', [roomKey, 100])
    await callGame('updatePresence', [playerOne.playerId, true, 900])
    await callGame('updatePresence', [playerTwo.playerId, true, 900])

    return { callGame, playerOne, playerTwo }
  }

  it('cancels a deadline on reconnect and forfeits only after a later expiry', async () => {
    const { callGame, playerOne, playerTwo } = await createActiveRoom()
    const now = Date.now() + 60_000

    const disconnected = await callGame<PresenceUpdateResult>(
      'updatePresence',
      [playerOne.playerId, false, now]
    )
    expect(disconnected).toMatchObject({
      status: 'updated',
      reconnectDeadline: now + 100
    })

    const reconnected = await callGame<PresenceUpdateResult>('updatePresence', [
      playerOne.playerId,
      true,
      now + 50
    ])
    expect(reconnected).toMatchObject({
      status: 'updated',
      reconnectDeadline: 0
    })
    expect(
      await callGame<PresenceUpdateResult>('adjudicateDisconnects', [now + 200])
    ).toEqual({
      status: 'unchanged'
    })

    await callGame('updatePresence', [playerOne.playerId, false, now + 1_000])
    const adjudicated = await callGame<PresenceUpdateResult>(
      'adjudicateDisconnects',
      [now + 1_100]
    )
    expect(adjudicated).toMatchObject({
      status: 'adjudicated',
      gameState: {
        outcome: 'game-ended',
        finishReason: 'forfeit',
        winnerId: playerTwo.playerId
      }
    })
    expect(
      await callGame<PresenceUpdateResult>('adjudicateDisconnects', [
        now + 1_100
      ])
    ).toEqual({
      status: 'unchanged'
    })
  })

  it('marks the game no-contest when both deadlines expire', async () => {
    const { callGame, playerOne, playerTwo } = await createActiveRoom()
    const now = Date.now() + 60_000

    await callGame('updatePresence', [playerOne.playerId, false, now])
    await callGame('updatePresence', [playerTwo.playerId, false, now + 10])
    const adjudicated = await callGame<PresenceUpdateResult>(
      'adjudicateDisconnects',
      [now + 110]
    )

    expect(adjudicated).toMatchObject({
      status: 'adjudicated',
      gameState: {
        outcome: 'game-ended',
        finishReason: 'no-contest'
      }
    })
    if (adjudicated.status === 'adjudicated') {
      expect(adjudicated.gameState.winnerId).toBeUndefined()
      expect(adjudicated.gameState.outcomeHistory).toEqual([])
    }
  })
})

describe('runtime request validation', () => {
  it('rejects malformed route and query values before room mutation', async () => {
    const player = await createPlayer()
    const roomKey = crypto.randomUUID()
    const headers = {
      ...authorization(player),
      'Idempotency-Key': crypto.randomUUID()
    }

    const invalidRoom = await request(`/not-a-room/${player.playerId}/init`, {
      method: 'POST',
      headers
    })
    const invalidSettings = await request(
      `/${roomKey}/${player.playerId}/init?boType=2`,
      { method: 'POST', headers }
    )
    const invalidMove = await request(
      `/${roomKey}/${player.playerId}/play/3/4.5`,
      { method: 'POST', headers }
    )
    const blankDisplayName = await request(
      `/${roomKey}/${player.playerId}/displayName/%20`,
      { method: 'POST', headers }
    )

    for (const [label, response, code] of [
      ['invalid room', invalidRoom, 'INVALID_ROUTE_PARAMETERS'],
      ['invalid settings', invalidSettings, 'INVALID_GAME_SETTINGS'],
      ['invalid move', invalidMove, 'INVALID_ROUTE_PARAMETERS'],
      ['blank display name', blankDisplayName, 'INVALID_ROUTE_PARAMETERS']
    ] as const) {
      expect(
        response.status,
        `${label}: ${await response.clone().text()}`
      ).toBe(400)
      const body = apiErrorBodySchema.parse(await response.json())
      expect(body.error.code).toBe(code)
      expect(response.headers.get('X-Request-Id')).toBe(body.error.requestId)
    }
  })

  it('accepts only column intent and derives the actor from authentication', async () => {
    const playerOne = await createPlayer()
    const playerTwo = await createPlayer()
    const spectator = await createPlayer()
    const roomKey = crypto.randomUUID()

    for (const player of [playerOne, playerTwo]) {
      const response = await request(`/${roomKey}/${player.playerId}/init`, {
        method: 'POST',
        headers: {
          ...authorization(player),
          'Idempotency-Key': crypto.randomUUID()
        }
      })
      expect(response.status).toBe(200)
    }

    const submittedFacts = await request(`/v1/rooms/${roomKey}/play`, {
      method: 'POST',
      headers: {
        ...authorization(playerOne),
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify({
        column: 0,
        author: playerTwo.playerId,
        dice: 6
      })
    })
    const spectatorMove = await request(`/v1/rooms/${roomKey}/play`, {
      method: 'POST',
      headers: {
        ...authorization(spectator),
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify({ column: 0 })
    })

    expect(submittedFacts.status).toBe(400)
    await expect(submittedFacts.json()).resolves.toMatchObject({
      error: { code: 'INVALID_PLAY_INTENT' }
    })
    expect(spectatorMove.status).toBe(403)
    await expect(spectatorMove.json()).resolves.toMatchObject({
      error: { code: 'NOT_A_PLAYER' }
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
