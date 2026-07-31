import { status } from 'itty-router'
import { GameState } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameStateDurableObject
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
  const play = {
    dice: Number(request.dice),
    column: Number(request.column),
    author: request.playerId
  }

  const iGameState = await getGameStateDurableObject(request).play(play)
  const gameState = GameState.fromJson(iGameState)
  await broadcastGameState(iGameState, request, cloudflareEnvironment)

  if (
    gameState.outcome === 'ongoing' &&
    gameState.playerTwo.isAi() &&
    gameState.nextPlayer.equals(gameState.playerTwo)
  ) {
    makeAiPlay(gameState, request, cloudflareEnvironment, context)
  }

  return status(200)
}
