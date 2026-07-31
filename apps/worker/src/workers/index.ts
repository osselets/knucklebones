import { withDurables } from 'itty-durable'
import { Router, cors, error, withParams } from 'itty-router'
import { Toucan } from 'toucan-js'
import {
  deleteDisplayName,
  displayName,
  init,
  play,
  rematch,
  webSocket
} from '../endpoints'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'

export { GameStateDurableObject } from '../durable-objects/GameStateDurableObject'
export { WebSocketDurableObject } from '../durable-objects/WebSocketDurableObject'

const router = Router()

const { preflight, corsify } = cors({
  allowMethods: ['POST', 'DELETE']
})

router
  .all('*', withDurables({ parse: true }), preflight, withParams)

  .post('/:roomKey/:playerId/init', init)
  .post('/:roomKey/:playerId/play/:column/:dice', play)
  .post('/:roomKey/:playerId/rematch', rematch)
  .post('/:roomKey/:playerId/displayName/:displayName', displayName)

  .delete('/:roomKey/:playerId/displayName', deleteDisplayName)

  .all('*', () => error(404, 'Are you sure about that?'))

export default {
  async fetch(
    request: Request,
    cloudflareEnvironment: CloudflareEnvironment,
    context: ExecutionContext
  ) {
    const sentry = new Toucan({
      dsn: cloudflareEnvironment.SENTRY_DSN,
      context,
      request
    })

    if (isWebSocketEndpointCalled(request)) {
      return await webSocket(request, cloudflareEnvironment).catch((error) => {
        sentry.captureException(error)
      })
    }

    return await router
      .fetch(request, cloudflareEnvironment, context)
      .then((response) => corsify(response, request))
      .catch((error: unknown) => {
        sentry.captureException(error)
      })
  }
}

function isWebSocketEndpointCalled(request: Request) {
  const webSocketEndpointRegex = /\/[a-zA-Z0-9-]+\/websocket/
  const pathname = new URL(request.url).pathname
  return webSocketEndpointRegex.test(pathname)
}
