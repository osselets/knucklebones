import { status } from 'itty-router'
import {
  credentialIdSchema,
  deviceCredentialListSchema,
  type PlayerCredentials
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type AuthenticatedRequestWithProps } from '../types/itty'
import { createDeviceCredential } from '../utils/credentials'
import { apiError } from '../utils/http'

interface DeviceCredentialRow {
  credential_id: string
  created_at: number
}

interface RevokeDeviceCredentialRequest extends AuthenticatedRequestWithProps {
  credentialId?: string
}

export async function listDeviceCredentials(
  request: AuthenticatedRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const { results } = await cloudflareEnvironment.PLAYERS_DB.prepare(
    `SELECT credential_id, created_at
     FROM device_credentials
     WHERE player_id = ? AND revoked_at IS NULL
     ORDER BY created_at ASC`
  )
    .bind(request.principal.playerId)
    .all<DeviceCredentialRow>()

  const credentials = deviceCredentialListSchema.parse(
    results.map((credential) => ({
      credentialId: credential.credential_id,
      createdAt: credential.created_at,
      current: credential.credential_id === request.principal.credentialId
    }))
  )

  return Response.json(credentials, {
    headers: { 'Cache-Control': 'no-store' }
  })
}

export async function rotateDeviceCredential(
  request: AuthenticatedRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const { credentialId, credential, secretHash } =
    await createDeviceCredential()
  const createdAt = Date.now()

  await cloudflareEnvironment.PLAYERS_DB.batch([
    cloudflareEnvironment.PLAYERS_DB.prepare(
      `INSERT INTO device_credentials
        (credential_id, player_id, secret_hash, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind(credentialId, request.principal.playerId, secretHash, createdAt),
    cloudflareEnvironment.PLAYERS_DB.prepare(
      `UPDATE device_credentials
       SET revoked_at = ?
       WHERE credential_id = ? AND player_id = ? AND revoked_at IS NULL`
    ).bind(
      createdAt,
      request.principal.credentialId,
      request.principal.playerId
    )
  ])

  return Response.json(
    {
      playerId: request.principal.playerId,
      credential
    } satisfies PlayerCredentials,
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function revokeDeviceCredential(
  request: RevokeDeviceCredentialRequest,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const credentialId = credentialIdSchema.safeParse(request.credentialId)
  if (!credentialId.success) {
    return apiError({
      status: 400,
      code: 'INVALID_CREDENTIAL_ID',
      message: 'The device credential ID is invalid.',
      requestId: request.requestId
    })
  }

  if (credentialId.data === request.principal.credentialId) {
    return apiError({
      status: 409,
      code: 'CANNOT_REVOKE_CURRENT_CREDENTIAL',
      message: 'Rotate the current credential instead of revoking it.',
      requestId: request.requestId
    })
  }

  const result = await cloudflareEnvironment.PLAYERS_DB.prepare(
    `UPDATE device_credentials
     SET revoked_at = ?
     WHERE credential_id = ? AND player_id = ? AND revoked_at IS NULL`
  )
    .bind(Date.now(), credentialId.data, request.principal.playerId)
    .run()

  if (result.meta.changes === 0) {
    return apiError({
      status: 404,
      code: 'DEVICE_CREDENTIAL_NOT_FOUND',
      message: 'The active device credential was not found.',
      requestId: request.requestId
    })
  }

  return status(204)
}

export async function revokeOtherDeviceCredentials(
  request: AuthenticatedRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  await cloudflareEnvironment.PLAYERS_DB.prepare(
    `UPDATE device_credentials
     SET revoked_at = ?
     WHERE player_id = ? AND credential_id <> ? AND revoked_at IS NULL`
  )
    .bind(
      Date.now(),
      request.principal.playerId,
      request.principal.credentialId
    )
    .run()

  return status(204)
}
