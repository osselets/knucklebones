import { status } from 'itty-router'
import {
  displayNameRouteParamsSchema,
  idempotentUpdateDisplayNameResultSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type MutationRequestWithProps } from '../types/itty'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'
import { apiError } from '../utils/http'
import { idempotencyConflict } from '../utils/idempotency'
import { invalidRouteParameters } from '../utils/validation'

interface DisplayNameRequest extends MutationRequestWithProps {
  displayName?: string
}

export async function displayName(
  request: DisplayNameRequest,
  cloudflareEnvironment: CloudflareEnvironment
) {
  const params = displayNameRouteParamsSchema.safeParse({
    roomKey: request.roomKey,
    playerId: request.playerId,
    displayName: request.displayName
  })
  if (!params.success) {
    return invalidRouteParameters(request.requestId)
  }

  const result = idempotentUpdateDisplayNameResultSchema.parse(
    await getGameStateDurableObject(request).updateDisplayName(
      request.mutationId,
      request.playerId,
      params.data.displayName
    )
  )

  if (result.idempotencyStatus === 'conflict') {
    return idempotencyConflict(request.requestId)
  }

  const mutation = result.value

  if (mutation.status === 'unknown-player') {
    return apiError({
      status: 400,
      code: 'UNEXPECTED_PLAYER_ID',
      message: 'Unexpected playerId received.',
      requestId: request.requestId
    })
  }

  await broadcastGameState(mutation.gameState, request, cloudflareEnvironment)

  return status(200)
}
