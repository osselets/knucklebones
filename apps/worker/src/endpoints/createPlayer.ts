import { type PlayerCredentials } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { createDeviceCredential } from '../utils/credentials'

export async function createPlayer(
  _request: Request,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const playerId = crypto.randomUUID()
  const { credentialId, credential, secretHash } =
    await createDeviceCredential()
  const createdAt = Date.now()

  await cloudflareEnvironment.PLAYERS_DB.batch([
    cloudflareEnvironment.PLAYERS_DB.prepare(
      'INSERT INTO players (player_id, credential_hash, created_at) VALUES (?, ?, ?)'
    ).bind(playerId, secretHash, createdAt),
    cloudflareEnvironment.PLAYERS_DB.prepare(
      `INSERT INTO device_credentials
        (credential_id, player_id, secret_hash, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind(credentialId, playerId, secretHash, createdAt)
  ])

  return Response.json({ playerId, credential } satisfies PlayerCredentials, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' }
  })
}
