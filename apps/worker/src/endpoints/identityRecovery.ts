import {
  identityRecoverySchema,
  identityRecoveryPhraseSchema,
  redeemIdentityRecoveryRequestSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import {
  type AuthenticatedRequestWithProps,
  type RequestWithId
} from '../types/itty'
import {
  createDeviceCredential,
  createRecoveryPhrase,
  hashCredential
} from '../utils/credentials'
import { apiError } from '../utils/http'

interface IdentityRecoveryRow {
  player_id: string
}

export async function rotateIdentityRecovery(
  request: AuthenticatedRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const recoveryPhrase = createRecoveryPhrase()
  const rotatedAt = Date.now()

  await cloudflareEnvironment.PLAYERS_DB.prepare(
    `INSERT INTO recovery_credentials
      (player_id, verifier_hash, created_at, rotated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET
       verifier_hash = excluded.verifier_hash,
       version = recovery_credentials.version + 1,
       rotated_at = excluded.rotated_at`
  )
    .bind(
      request.principal.playerId,
      await hashCredential(recoveryPhrase),
      rotatedAt,
      rotatedAt
    )
    .run()

  return Response.json(identityRecoveryPhraseSchema.parse({ recoveryPhrase }), {
    status: 201,
    headers: { 'Cache-Control': 'no-store' }
  })
}

export async function redeemIdentityRecovery(
  request: Request & RequestWithId,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const rawBody = (await request.json().catch(() => undefined)) as
    Record<string, unknown> | undefined
  const body = redeemIdentityRecoveryRequestSchema.safeParse({
    ...rawBody,
    recoveryPhrase:
      typeof rawBody?.recoveryPhrase === 'string'
        ? rawBody.recoveryPhrase.trim().toLowerCase()
        : rawBody?.recoveryPhrase
  })
  if (!body.success) {
    return apiError({
      status: 400,
      code: 'INVALID_IDENTITY_RECOVERY',
      message: 'The identity recovery request is invalid.',
      requestId: request.requestId
    })
  }

  const replacementPhrase = createRecoveryPhrase()
  const recoveredAt = Date.now()
  const deviceCredential = await createDeviceCredential()
  const recovery = await cloudflareEnvironment.PLAYERS_DB.prepare(
    `UPDATE recovery_credentials
     SET verifier_hash = ?,
         version = version + 1,
         rotated_at = ?,
         issued_credential_id = ?,
         issued_secret_hash = ?,
         revoke_other_devices = ?
     WHERE verifier_hash = ?
     RETURNING player_id`
  )
    .bind(
      await hashCredential(replacementPhrase),
      recoveredAt,
      deviceCredential.credentialId,
      deviceCredential.secretHash,
      body.data.revokeOtherDevices === true ? 1 : 0,
      await hashCredential(body.data.recoveryPhrase)
    )
    .first<IdentityRecoveryRow>()

  if (recovery === null) {
    return apiError({
      status: 410,
      code: 'IDENTITY_RECOVERY_UNAVAILABLE',
      message: 'The recovery phrase is invalid or has already been rotated.',
      requestId: request.requestId
    })
  }

  return Response.json(
    identityRecoverySchema.parse({
      playerId: recovery.player_id,
      credential: deviceCredential.credential,
      recoveryPhrase: replacementPhrase
    }),
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  )
}
