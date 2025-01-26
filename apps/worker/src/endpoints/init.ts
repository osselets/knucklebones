import { status } from 'itty-router'
import { type Difficulty, Player, type BoType } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameState,
  getLobby,
  isGameStateInitialized,
  saveGameState,
  saveLobby
} from '../utils/endpoints'
import { type GameMode } from './../../../../packages/common/src/types/gameSettings'

export interface InitRequest extends BaseRequestWithProps {
  query?: {
    displayName?: string
    difficulty?: Difficulty
    gameMode?: GameMode
    boType?: BoType
  }
}

export async function init(
  request: InitRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  if (await isGameStateInitialized(request)) {
    const gameState = await getGameState(request)

    if (gameState.addSpectator(request.playerId)) {
      await saveGameState(gameState, request)
    }

    await broadcastGameState(gameState, request, cloudflareEnvironment)
  } else {
    const lobby = await getLobby(request)

    const player = new Player(
      request.playerId,
      request.query?.displayName,
      request.query?.difficulty
    )

    if (request.query?.boType !== undefined) {
      lobby.setBoType(request.query.boType)
    }

    if (request.query?.gameMode !== undefined) {
      lobby.setGameMode(request.query.gameMode)
    }

    if (lobby.addPlayer(player)) {
      await saveLobby(lobby, request)
    }

    if (lobby.isReady()) {
      const gameState = lobby.toGameState()

      await saveGameState(gameState, request)
      await broadcastGameState(gameState, request, cloudflareEnvironment)

      if (
        gameState.playerTwo.isAi() &&
        gameState.nextPlayer.equals(gameState.playerTwo)
      ) {
        makeAiPlay(gameState, request, cloudflareEnvironment, context)
      }
    }
  }

  return status(200)
}
