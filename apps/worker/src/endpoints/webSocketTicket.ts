import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type AuthenticatedRoomRequestWithProps } from '../types/itty'
import { enforceRateLimit } from '../utils/rateLimit'

export async function createWebSocketTicket(
  request: Request & AuthenticatedRoomRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const rateLimit = await enforceRateLimit(
    request,
    cloudflareEnvironment.PLAYERS_DB,
    {
      scope: 'websocket-ticket',
      identifier: request.principal.playerId,
      limit: 120,
      windowMs: 60 * 1000
    }
  )
  if (rateLimit !== undefined) {
    return rateLimit
  }

  const id = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.idFromName(
    request.roomKey
  )
  const webSocketStore = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.get(id)

  return await webSocketStore.fetch('https://dummy-url/ticket', {
    method: 'POST',
    headers: {
      'X-Player-Id': request.principal.playerId,
      'X-Credential-Id': request.principal.credentialId,
      'X-Room-Key': request.roomKey,
      'X-Request-Id': request.requestId
    }
  })
}
