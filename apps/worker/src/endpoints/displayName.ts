import { status } from 'itty-router'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'
import { apiError } from '../utils/http'

interface DisplayNameRequest extends BaseRequestWithProps {
  displayName: string
}

export async function displayName(
  request: DisplayNameRequest,
  cloudflareEnvironment: CloudflareEnvironment
) {
  const result = await getGameStateDurableObject(request).updateDisplayName(
    request.playerId,
    request.displayName
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
