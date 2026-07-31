import { type IGameState, toGameStateMessage } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'

export function getGameStateDurableObject(request: BaseRequestWithProps) {
  return request.GAME_STATE_DURABLE_OBJECT.get(request.roomKey)
}

export async function broadcastGameState(
  gameState: IGameState,
  request: BaseRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
) {
  const roomKey = request.roomKey
  const id = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.idFromName(roomKey)
  const webSocketStore = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.get(id)

  return await webSocketStore.fetch('https://dummy-url/broadcast', {
    method: 'POST',
    headers: { 'X-Request-Id': request.requestId },
    body: JSON.stringify(toGameStateMessage(gameState))
  })
}
