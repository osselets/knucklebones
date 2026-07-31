import { status } from 'itty-router'
import { GameState, type Difficulty, type BoType } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type MutationRequestWithProps } from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'
import { idempotencyConflict } from '../utils/idempotency'

export interface InitRequest extends MutationRequestWithProps {
  query?: { displayName?: string; difficulty?: Difficulty; boType?: BoType }
}

export async function init(
  request: InitRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const result = await getGameStateDurableObject(request).initializeGame({
    mutationId: request.mutationId,
    playerId: request.playerId,
    displayName: request.query?.displayName,
    difficulty: request.query?.difficulty,
    boType: request.query?.boType
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
