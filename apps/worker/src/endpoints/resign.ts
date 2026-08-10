import { status } from 'itty-router'
import {
  idempotentResignGameResultSchema,
  rankedMatchSettlementResultSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type AuthenticatedMutationRoomRequestWithProps } from '../types/itty'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'
import { apiError } from '../utils/http'
import { idempotencyConflict } from '../utils/idempotency'
import { recordOperationalEvent } from '../utils/observability'

export async function resignRoom(
  request: Request & AuthenticatedMutationRoomRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const gameStateStore = getGameStateDurableObject(request)
  const result = idempotentResignGameResultSchema.parse(
    await gameStateStore.resign({
      mutationId: request.mutationId,
      playerId: request.principal.playerId
    })
  )

  if (result.idempotencyStatus === 'conflict') {
    return idempotencyConflict(request.requestId)
  }

  const mutation = result.value
  if (mutation.status !== 'updated') {
    return resignError(mutation.status, request.requestId)
  }

  rankedMatchSettlementResultSchema.parse(
    await gameStateStore.settleRankedResult()
  )
  recordOperationalEvent(cloudflareEnvironment.ENVIRONMENT, {
    event: 'ranked.resignation',
    outcome: result.idempotencyStatus === 'replayed' ? 'replayed' : 'accepted'
  })
  await broadcastGameState(mutation.gameState, request, cloudflareEnvironment)
  return status(200)
}

function resignError(
  reason: Exclude<
    Extract<
      ReturnType<typeof idempotentResignGameResultSchema.parse>,
      { idempotencyStatus: 'applied' | 'replayed' }
    >['value'],
    { status: 'updated' }
  >['status'],
  requestId: string
): Response {
  switch (reason) {
    case 'game-not-initialized':
      return apiError({
        status: 409,
        code: 'GAME_NOT_INITIALIZED',
        message: 'The game has not started yet.',
        requestId
      })
    case 'game-ended':
      return apiError({
        status: 409,
        code: 'GAME_ALREADY_FINISHED',
        message: 'The game has already ended.',
        requestId
      })
    case 'unknown-player':
      return apiError({
        status: 403,
        code: 'NOT_A_PLAYER',
        message: 'Only a player in this game can resign.',
        requestId
      })
    case 'not-ranked':
      return apiError({
        status: 409,
        code: 'NOT_A_RANKED_MATCH',
        message: 'Only ranked matches support resignation.',
        requestId
      })
  }
}
