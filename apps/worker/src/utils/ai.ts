import {
  type GameState,
  getRandomIntInclusive,
  sleep
} from '@knucklebones/common'
import { Ai } from '../classes/Ai'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import {
  type DurableRoomRequestWithProps,
  type RequestWithMutationId
} from '../types/itty'
import { broadcastGameState } from './endpoints'
import { applyAuthoritativePlay, getAppliedPlayResult } from './play'

export function makeAiPlay(
  gameState: GameState,
  request: DurableRoomRequestWithProps & RequestWithMutationId,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const aiPlay = async () => {
    const ai = new Ai(
      gameState.playerOne,
      gameState.playerTwo,
      gameState.nextPlayer.dice!,
      gameState.nextPlayer.difficulty!
    )

    const nextMove = ai.suggestNextPlay()

    const [min, max] =
      cloudflareEnvironment.ENVIRONMENT === 'development'
        ? [100, 200]
        : [500, 1000]
    await sleep(getRandomIntInclusive(min, max))

    const aiRequest = {
      GAME_STATE_DURABLE_OBJECT: request.GAME_STATE_DURABLE_OBJECT,
      roomKey: request.roomKey,
      requestId: request.requestId,
      mutationId: crypto.randomUUID()
    }
    const result = await applyAuthoritativePlay(
      aiRequest,
      gameState.playerTwo.id,
      nextMove.column,
      gameState.revision
    )
    const mutation = getAppliedPlayResult(result)

    if (mutation?.status === 'updated') {
      await broadcastGameState(
        mutation.gameState,
        request,
        cloudflareEnvironment
      )
    }
  }

  context.waitUntil(aiPlay())
}
