import { status } from 'itty-router'
import { GameState } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type MutationRequestWithProps } from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'
import {
  type GameSettingsQuery,
  parseGameSettingsQuery
} from '../utils/gameSettings'
import { apiError } from '../utils/http'
import { idempotencyConflict } from '../utils/idempotency'

export interface RematchRequest extends MutationRequestWithProps {
  query?: GameSettingsQuery
}

export async function rematch(
  request: RematchRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const gameSettings = parseGameSettingsQuery(request.query)

  if (!gameSettings.success) {
    return apiError({
      status: 400,
      code: 'INVALID_GAME_SETTINGS',
      message: 'The game settings are invalid.',
      requestId: request.requestId
    })
  }

  const result = await getGameStateDurableObject(request).rematch(
    request.mutationId,
    request.playerId,
    gameSettings.value
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
