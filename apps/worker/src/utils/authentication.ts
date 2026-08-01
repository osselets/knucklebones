import {
  AI_PLAYER_ID,
  credentialIdSchema,
  credentialSchema,
  playerCredentialSchema,
  playerIdSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import {
  type AuthenticatedRequestWithProps,
  type RequestWithId
} from '../types/itty'
import {
  constantTimeEqual,
  hashCredential,
  parseDeviceCredential
} from './credentials'
import { apiError } from './http'

interface DeviceCredentialRow {
  credential_id: string
  player_id: string
  secret_hash: string
}

interface PlayerRequest extends RequestWithId {
  playerId?: string
  principal?: AuthenticatedRequestWithProps['principal']
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

  const { credentialId, secret } = parseDeviceCredential(credential)
  const credentialHash = await hashCredential(secret)
  const identity = await findDeviceCredential(
    cloudflareEnvironment.PLAYERS_DB,
    credentialId,
    credentialHash
  )

  const authenticatedPlayerId = playerIdSchema.safeParse(identity?.player_id)
  const authenticatedCredentialId = credentialIdSchema.safeParse(
    identity?.credential_id
  )
  const storedHash = credentialSchema.safeParse(identity?.secret_hash)

  if (
    !authenticatedPlayerId.success ||
    !authenticatedCredentialId.success ||
    !storedHash.success ||
    !constantTimeEqual(credentialHash, storedHash.data)
  ) {
    return apiError({
      status: 401,
      code: 'INVALID_PLAYER_CREDENTIAL',
      message: 'The player credential is invalid.',
      requestId: request.requestId
    })
  }

  request.principal = {
    playerId: authenticatedPlayerId.data,
    credentialId: authenticatedCredentialId.data
  }

  const isAiSetup =
    request.playerId === AI_PLAYER_ID &&
    new URL(request.url).pathname.endsWith(`/${AI_PLAYER_ID}/init`)

  if (
    request.playerId !== undefined &&
    request.playerId !== authenticatedPlayerId.data &&
    !isAiSetup
  ) {
    return apiError({
      status: 403,
      code: 'PLAYER_ID_MISMATCH',
      message: 'The player credential does not match the requested player.',
      requestId: request.requestId
    })
  }
}

function getBearerCredential(authorization: string | null): string | undefined {
  const prefix = 'Bearer '
  if (!authorization?.startsWith(prefix)) {
    return undefined
  }

  const credential = playerCredentialSchema.safeParse(
    authorization.slice(prefix.length)
  )
  return credential.success ? credential.data : undefined
}

async function findDeviceCredential(
  database: D1Database,
  credentialId: string | undefined,
  credentialHash: string
): Promise<DeviceCredentialRow | null> {
  if (credentialId !== undefined) {
    return await database
      .prepare(
        `SELECT credential_id, player_id, secret_hash
         FROM device_credentials
         WHERE credential_id = ? AND revoked_at IS NULL`
      )
      .bind(credentialId)
      .first<DeviceCredentialRow>()
  }

  return await database
    .prepare(
      `SELECT credential_id, player_id, secret_hash
       FROM device_credentials
       WHERE secret_hash = ? AND revoked_at IS NULL`
    )
    .bind(credentialHash)
    .first<DeviceCredentialRow>()
}
