import { error, status } from 'itty-router'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'

export async function deleteDisplayName(
  request: BaseRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
) {
  const result = await getGameStateDurableObject(request).updateDisplayName(
    request.playerId,
    undefined
  )

  if (result.status === 'unknown-player') {
    return error(400, 'Unexpected playerId received.')
  }

  await broadcastGameState(result.gameState, request, cloudflareEnvironment)

  return status(200)
}
