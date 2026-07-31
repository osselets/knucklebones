import { status } from 'itty-router'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameState,
  saveGameState
} from '../utils/endpoints'

interface PlayRequest extends BaseRequestWithProps {
  dice: number
  column: number
}

export async function play(
  request: PlayRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const gameState = await getGameState(request)

  const play = {
    dice: Number(request.dice),
    column: Number(request.column),
    author: request.playerId
  }

  gameState.applyPlay(play)

  await saveGameState(gameState, request)
  await broadcastGameState(gameState, request, cloudflareEnvironment)

  if (
    gameState.outcome === 'ongoing' &&
    gameState.playerTwo.isAi() &&
    gameState.nextPlayer.equals(gameState.playerTwo)
  ) {
    makeAiPlay(gameState, request, cloudflareEnvironment, context)
  }

  return status(200)
}
