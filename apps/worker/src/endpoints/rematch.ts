import { error, status } from 'itty-router'
import { type GameSettings, GameState } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'

export interface RematchRequest extends BaseRequestWithProps {
  query?: Omit<GameSettings, 'playerType'>
}

export async function rematch(
  request: RematchRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const result = await getGameStateDurableObject(request).rematch(
    request.playerId,
    request.query
  )

  if (result.status === 'game-ongoing') {
    return error(400, "The game is still ongoing. Can't rematch.")
  }

  if (result.status === 'updated') {
    const gameState = GameState.fromJson(result.gameState)
    await broadcastGameState(result.gameState, request, cloudflareEnvironment)

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
