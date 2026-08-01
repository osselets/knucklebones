import { type PlayerCredentials } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { createCredential, hashCredential } from '../utils/credentials'

export async function createPlayer(
  _request: Request,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const playerId = crypto.randomUUID()
  const credential = createCredential()
  const credentialHash = await hashCredential(credential)

  await cloudflareEnvironment.PLAYERS_DB.prepare(
    'INSERT INTO players (player_id, credential_hash, created_at) VALUES (?, ?, ?)'
  )
    .bind(playerId, credentialHash, Date.now())
    .run()

  return Response.json({ playerId, credential } satisfies PlayerCredentials, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' }
  })
}
