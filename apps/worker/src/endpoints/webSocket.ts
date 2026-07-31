import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type RequestWithId } from '../types/itty'

export async function webSocket(
  request: Request & RequestWithId,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const pathname = new URL(request.url).pathname
  // slice(1) removes leading slash
  // so no empty entries when splitting
  const roomKey = pathname.slice(1).split('/')[0]

  const id = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.idFromName(roomKey)
  const webSocketStore = cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.get(id)
  const durableObjectRequest = new Request(
    'https://dummy-url/websocket',
    request
  )
  durableObjectRequest.headers.set('X-Request-Id', request.requestId)

  return await webSocketStore.fetch(durableObjectRequest)
}
