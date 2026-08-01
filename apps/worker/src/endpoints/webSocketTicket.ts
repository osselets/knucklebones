import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type BaseRequestWithProps } from '../types/itty'

export async function createWebSocketTicket(
  request: BaseRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const id = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.idFromName(
    request.roomKey
  )
  const webSocketStore = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.get(id)

  return await webSocketStore.fetch('https://dummy-url/ticket', {
    method: 'POST',
    headers: {
      'X-Player-Id': request.playerId,
      'X-Request-Id': request.requestId
    }
  })
}
