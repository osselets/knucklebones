import {
  identityTransferSchema,
  playerCredentialsSchema,
  redeemIdentityTransferRequestSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import {
  type AuthenticatedRequestWithProps,
  type RequestWithId
} from '../types/itty'
import {
  createCredential,
  createDeviceCredential,
  hashCredential
} from '../utils/credentials'
import { apiError } from '../utils/http'
import { enforceRateLimit } from '../utils/rateLimit'

const IDENTITY_TRANSFER_TTL_MS = 10 * 60 * 1000

interface IdentityTransferRedemptionRow {
  player_id: string
}

export async function createIdentityTransfer(
  request: Request & AuthenticatedRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const rateLimit = await enforceRateLimit(
    request,
    cloudflareEnvironment.PLAYERS_DB,
    {
      scope: 'identity-transfer-create',
      identifier: request.principal.playerId,
      limit: 20,
      windowMs: 60 * 60 * 1000
    }
  )
  if (rateLimit !== undefined) {
    return rateLimit
  }

  const transferToken = createCredential()
  const createdAt = Date.now()
  const expiresAt = createdAt + IDENTITY_TRANSFER_TTL_MS

  await cloudflareEnvironment.PLAYERS_DB.prepare(
    `INSERT INTO identity_transfers
      (transfer_id, token_hash, player_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      await hashCredential(transferToken),
      request.principal.playerId,
      createdAt,
      expiresAt
    )
    .run()

  return Response.json(
    identityTransferSchema.parse({ transferToken, expiresAt }),
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function redeemIdentityTransfer(
  request: Request & RequestWithId,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const rateLimit = await enforceRateLimit(
    request,
    cloudflareEnvironment.PLAYERS_DB,
    {
      scope: 'identity-transfer-redeem',
      limit: 20,
      windowMs: 15 * 60 * 1000
    }
  )
  if (rateLimit !== undefined) {
    return rateLimit
  }

  const body = redeemIdentityTransferRequestSchema.safeParse(
    await request.json().catch(() => undefined)
  )
  if (!body.success) {
    return apiError({
      status: 400,
      code: 'INVALID_IDENTITY_TRANSFER',
      message: 'The identity transfer request is invalid.',
      requestId: request.requestId
    })
  }

  const redeemedAt = Date.now()
  const deviceCredential = await createDeviceCredential()
  const redemption = await cloudflareEnvironment.PLAYERS_DB.prepare(
    `UPDATE identity_transfers
     SET redeemed_at = ?,
         issued_credential_id = ?,
         issued_secret_hash = ?,
         revoke_other_devices = ?
     WHERE token_hash = ?
       AND redeemed_at IS NULL
       AND expires_at > ?
     RETURNING player_id`
  )
    .bind(
      redeemedAt,
      deviceCredential.credentialId,
      deviceCredential.secretHash,
      body.data.revokeOtherDevices === true ? 1 : 0,
      await hashCredential(body.data.transferToken),
      redeemedAt
    )
    .first<IdentityTransferRedemptionRow>()

  if (redemption === null) {
    return apiError({
      status: 410,
      code: 'IDENTITY_TRANSFER_UNAVAILABLE',
      message: 'The identity transfer is invalid, expired, or already used.',
      requestId: request.requestId
    })
  }

  return Response.json(
    playerCredentialsSchema.parse({
      playerId: redemption.player_id,
      credential: deviceCredential.credential
    }),
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  )
}
