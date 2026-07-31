import { status } from 'itty-router'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'
import { apiError } from '../utils/http'

export async function deleteDisplayName(
  request: BaseRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
) {
  const result = await getGameStateDurableObject(request).updateDisplayName(
    request.playerId,
    undefined
  )

  if (result.status === 'unknown-player') {
    return apiError({
      status: 400,
      code: 'UNEXPECTED_PLAYER_ID',
      message: 'Unexpected playerId received.',
      requestId: request.requestId
    })
  }

  await broadcastGameState(result.gameState, request, cloudflareEnvironment)

  return status(200)
}
