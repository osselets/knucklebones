import { status } from 'itty-router'
import {
  displayNameRouteParamsSchema,
  GameState,
  idempotentUpdateDisplayNameResultSchema,
  updateDisplayNameSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import {
  type AuthenticatedMutationRoomRequestWithProps,
  type MutationRequestWithProps
} from '../types/itty'
import { makeAiPlay } from '../utils/ai'
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
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const params = displayNameRouteParamsSchema.safeParse({
    roomKey: request.roomKey,
    playerId: request.playerId,
    displayName: request.displayName
  })
  if (!params.success) {
    return invalidRouteParameters(request.requestId)
  }

  return await executeDisplayNameUpdate(
    request,
    params.data.displayName,
    cloudflareEnvironment,
    context
  )
}

export async function updateRoomDisplayName(
  request: Request & AuthenticatedMutationRoomRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
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

  return await executeDisplayNameUpdate(
    request,
    body.data.displayName,
    cloudflareEnvironment,
    context
  )
}

export async function executeDisplayNameUpdate(
  request: AuthenticatedMutationRoomRequestWithProps,
  displayName: string | undefined,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const result = idempotentUpdateDisplayNameResultSchema.parse(
    await getGameStateDurableObject(request).updateDisplayName(
      request.mutationId,
      request.principal.playerId,
      displayName
    )
  )

  if (result.idempotencyStatus === 'conflict') {
    return idempotencyConflict(request.requestId)
  }

  const mutation = result.value

  if (mutation.status === 'unknown-player') {
    return apiError({
      status: 403,
      code: 'NOT_A_PLAYER',
      message: 'Only a player in this game can change their display name.',
      requestId: request.requestId
    })
  }

  await broadcastGameState(mutation.gameState, request, cloudflareEnvironment)

  const gameState = GameState.fromJson(mutation.gameState)
  if (
    gameState.outcome === 'ongoing' &&
    gameState.playerTwo.isAi() &&
    gameState.nextPlayer.equals(gameState.playerTwo)
  ) {
    makeAiPlay(gameState, request, cloudflareEnvironment, context)
  }

  return status(200)
}
