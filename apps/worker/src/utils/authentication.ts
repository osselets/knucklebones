import { AI_PLAYER_ID } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type RequestWithId } from '../types/itty'
import { hashCredential } from './credentials'
import { apiError } from './http'

interface PlayerIdentityRow {
  player_id: string
}

interface PlayerRequest extends RequestWithId {
  playerId: string
}

export async function authenticatePlayerRequest(
  request: Request & PlayerRequest,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response | undefined> {
  const credential = getBearerCredential(request.headers.get('Authorization'))

  if (credential === undefined) {
    return apiError({
      status: 401,
      code: 'PLAYER_CREDENTIAL_REQUIRED',
      message: 'A valid player credential is required.',
      requestId: request.requestId
    })
  }

  const credentialHash = await hashCredential(credential)
  const identity = await cloudflareEnvironment.PLAYERS_DB.prepare(
    'SELECT player_id FROM players WHERE credential_hash = ?'
  )
    .bind(credentialHash)
    .first<PlayerIdentityRow>()

  if (identity === null) {
    return apiError({
      status: 401,
      code: 'INVALID_PLAYER_CREDENTIAL',
      message: 'The player credential is invalid.',
      requestId: request.requestId
    })
  }

  const isAiSetup =
    request.playerId === AI_PLAYER_ID &&
    new URL(request.url).pathname.endsWith(`/${AI_PLAYER_ID}/init`)

  if (request.playerId !== identity.player_id && !isAiSetup) {
    return apiError({
      status: 403,
      code: 'PLAYER_ID_MISMATCH',
      message: 'The player credential does not match the requested player.',
      requestId: request.requestId
    })
  }
}

function getBearerCredential(authorization: string | null): string | undefined {
  const match = authorization?.match(/^Bearer ([0-9a-f]{64})$/)
  return match?.[1]
}
