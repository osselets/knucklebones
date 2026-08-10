import { type PlayerIdentityBootstrap } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type RequestWithId } from '../types/itty'
import {
  createDeviceCredential,
  createRecoveryPhrase,
  hashCredential
} from '../utils/credentials'
import { enforceRateLimit } from '../utils/rateLimit'

export async function createPlayer(
  request: Request & RequestWithId,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const rateLimit = await enforceRateLimit(
    request,
    cloudflareEnvironment.PLAYERS_DB,
    { scope: 'identity-create', limit: 30, windowMs: 60 * 60 * 1000 }
  )
  if (rateLimit !== undefined) {
    return rateLimit
  }

  const playerId = crypto.randomUUID()
  const { credentialId, credential, secretHash } =
    await createDeviceCredential()
  const recoveryPhrase = createRecoveryPhrase()
  const createdAt = Date.now()

  await cloudflareEnvironment.PLAYERS_DB.batch([
    cloudflareEnvironment.PLAYERS_DB.prepare(
      'INSERT INTO players (player_id, credential_hash, created_at) VALUES (?, ?, ?)'
    ).bind(playerId, secretHash, createdAt),
    cloudflareEnvironment.PLAYERS_DB.prepare(
      `INSERT INTO device_credentials
        (credential_id, player_id, secret_hash, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind(credentialId, playerId, secretHash, createdAt),
    cloudflareEnvironment.PLAYERS_DB.prepare(
      `INSERT INTO recovery_credentials
        (player_id, verifier_hash, created_at, rotated_at)
       VALUES (?, ?, ?, ?)`
    ).bind(playerId, await hashCredential(recoveryPhrase), createdAt, createdAt)
  ])

  return Response.json(
    {
      playerId,
      credential,
      recoveryPhrase
    } satisfies PlayerIdentityBootstrap,
    {
      status: 201,
      headers: { 'Cache-Control': 'no-store' }
    }
  )
}
