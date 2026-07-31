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

export interface InitRequest extends MutationRequestWithProps {
  query?: GameSettingsQuery & { displayName?: string }
}

export async function init(
  request: InitRequest,
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

  const result = await getGameStateDurableObject(request).initializeGame({
    mutationId: request.mutationId,
    playerId: request.playerId,
    displayName: request.query?.displayName,
    difficulty: gameSettings.value.difficulty,
    boType: gameSettings.value.boType
  })

  if (result.idempotencyStatus === 'conflict') {
    return idempotencyConflict(request.requestId)
  }

  const mutation = result.value

  if (mutation.status !== 'waiting') {
    const gameState = GameState.fromJson(mutation.gameState)
    await broadcastGameState(mutation.gameState, request, cloudflareEnvironment)

    if (
      mutation.status === 'created' &&
      gameState.playerTwo.isAi() &&
      gameState.nextPlayer.equals(gameState.playerTwo)
    ) {
      makeAiPlay(gameState, request, cloudflareEnvironment, context)
    }
  }

  return status(200)
}
