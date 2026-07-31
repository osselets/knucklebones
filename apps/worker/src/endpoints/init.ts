import { status } from 'itty-router'
import { GameState, type Difficulty, type BoType } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'

export interface InitRequest extends BaseRequestWithProps {
  query?: { displayName?: string; difficulty?: Difficulty; boType?: BoType }
}

export async function init(
  request: InitRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const result = await getGameStateDurableObject(request).initializeGame({
    playerId: request.playerId,
    displayName: request.query?.displayName,
    difficulty: request.query?.difficulty,
    boType: request.query?.boType
  })

  if (result.status !== 'waiting') {
    const gameState = GameState.fromJson(result.gameState)
    await broadcastGameState(result.gameState, request, cloudflareEnvironment)

    if (
      result.status === 'created' &&
      gameState.playerTwo.isAi() &&
      gameState.nextPlayer.equals(gameState.playerTwo)
    ) {
      makeAiPlay(gameState, request, cloudflareEnvironment, context)
    }
  }

  return status(200)
}
