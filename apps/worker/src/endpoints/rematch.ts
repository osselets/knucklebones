import { status } from 'itty-router'
import { type GameSettings, GameState } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type MutationRequestWithProps } from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'
import { apiError } from '../utils/http'
import { idempotencyConflict } from '../utils/idempotency'

export interface RematchRequest extends MutationRequestWithProps {
  query?: Omit<GameSettings, 'playerType'>
}

export async function rematch(
  request: RematchRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const result = await getGameStateDurableObject(request).rematch(
    request.mutationId,
    request.playerId,
    request.query
  )

  if (result.idempotencyStatus === 'conflict') {
    return idempotencyConflict(request.requestId)
  }

  const mutation = result.value

  if (mutation.status === 'game-ongoing') {
    return apiError({
      status: 409,
      code: 'GAME_STILL_ONGOING',
      message: "The game is still ongoing. Can't rematch.",
      requestId: request.requestId
    })
  }

  if (mutation.status === 'updated') {
    const gameState = GameState.fromJson(mutation.gameState)
    await broadcastGameState(mutation.gameState, request, cloudflareEnvironment)

    if (
      gameState.outcome === 'ongoing' &&
      gameState.playerTwo.isAi() &&
      gameState.nextPlayer.equals(gameState.playerTwo)
    ) {
      makeAiPlay(gameState, request, cloudflareEnvironment, context)
    }
  }

  return status(200)
}
