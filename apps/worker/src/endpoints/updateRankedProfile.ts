import { status } from 'itty-router'
import { updateDisplayNameSchema } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type AuthenticatedRequestWithProps } from '../types/itty'
import { apiError } from '../utils/http'

export async function updateRankedProfile(
  request: Request & AuthenticatedRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const body = updateDisplayNameSchema.safeParse(
    await request.json().catch(() => undefined)
  )
  if (!body.success) {
    return apiError({
      status: 400,
      code: 'INVALID_DISPLAY_NAME_REQUEST',
      message: 'The display-name request is invalid.',
      requestId: request.requestId
    })
  }

  const result = await cloudflareEnvironment.PLAYERS_DB.prepare(
    'UPDATE players SET display_name = ? WHERE player_id = ?'
  )
    .bind(body.data.displayName, request.principal.playerId)
    .run()

  if (result.meta.changes !== 1) {
    throw new Error('The player profile update changed an invalid row count.')
  }

  return status(204)
}
