import { roomKeySchema } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type RequestWithId } from '../types/itty'
import { invalidRouteParameters } from '../utils/validation'

export async function webSocket(
  request: Request & RequestWithId,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname
  // slice(1) removes leading slash
  // so no empty entries when splitting
  const roomKey = pathname.slice(1).split('/')[0]

  if (!roomKeySchema.safeParse(roomKey).success) {
    return invalidRouteParameters(request.requestId)
  }

  const id = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.idFromName(roomKey)
  const webSocketStore = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.get(id)
  const durableObjectUrl = new URL('https://dummy-url/websocket')
  const ticket = url.searchParams.get('ticket')
  if (ticket !== null) {
    durableObjectUrl.searchParams.set('ticket', ticket)
  }

  const durableObjectRequest = new Request(durableObjectUrl, request)
  durableObjectRequest.headers.set('X-Request-Id', request.requestId)

  return await webSocketStore.fetch(durableObjectRequest)
}
