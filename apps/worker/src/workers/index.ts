import { withDurables } from 'itty-durable'
import { Router, cors, withParams } from 'itty-router'
import { Toucan } from 'toucan-js'
import {
  createPlayer,
  createWebSocketTicket,
  deleteDisplayName,
  displayName,
  getRankedProfile,
  getMatchmakingStatus,
  init,
  joinMatchmaking,
  leaveMatchmaking,
  play,
  rematch,
  verifyPlayer,
  webSocket
} from '../endpoints'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type RequestWithId } from '../types/itty'
import { authenticatePlayerRequest } from '../utils/authentication'
import {
  apiError,
  sanitizeRequestForSentry,
  withRequestId
} from '../utils/http'
import { withMutationId } from '../utils/idempotency'

export { GameStateDurableObject } from '../durable-objects/GameStateDurableObject'
export { MatchmakingDurableObject } from '../durable-objects/MatchmakingDurableObject'
export { WebSocketDurableObject } from '../durable-objects/WebSocketDurableObject'

const router = Router()

const { preflight, corsify } = cors({
  allowMethods: ['GET', 'POST', 'DELETE'],
  allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key']
})

router
  .all('*', withDurables({ parse: true }), preflight, withParams)

  .post('/players', createPlayer)
  .all('/players/:playerId/*', authenticatePlayerRequest)
  .post('/players/:playerId/verify', verifyPlayer)
  .get('/players/:playerId/rating', getRankedProfile)
  .all('/matchmaking/:playerId/*', authenticatePlayerRequest)
  .post('/matchmaking/:playerId/join', joinMatchmaking)
  .get('/matchmaking/:playerId/status', getMatchmakingStatus)
  .delete('/matchmaking/:playerId/queue', leaveMatchmaking)
  .all('/:roomKey/:playerId/*', authenticatePlayerRequest)
  .post('/:roomKey/:playerId/websocket-ticket', createWebSocketTicket)
  .post('/:roomKey/:playerId/init', withMutationId, init)
  .post('/:roomKey/:playerId/play/:column/:dice', withMutationId, play)
  .post('/:roomKey/:playerId/rematch', withMutationId, rematch)
  .post(
    '/:roomKey/:playerId/displayName/:displayName',
    withMutationId,
    displayName
  )

  .delete('/:roomKey/:playerId/displayName', withMutationId, deleteDisplayName)

  .all('*', (request: RequestWithId) =>
    apiError({
      status: 404,
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      requestId: request.requestId
    })
  )

export default {
  async fetch(
    request: Request,
    cloudflareEnvironment: CloudflareEnvironment,
    context: ExecutionContext
  ) {
    const requestId = crypto.randomUUID()
    const requestWithId = Object.assign(request, {
      requestId
    }) as Request & RequestWithId
    const sentry = new Toucan({
      dsn: cloudflareEnvironment.SENTRY_DSN,
      context,
      request: sanitizeRequestForSentry(request, requestId)
    })
    sentry.setTag('request_id', requestId)

    try {
      if (isWebSocketEndpointCalled(requestWithId)) {
        const response = await webSocket(requestWithId, cloudflareEnvironment)
        return withRequestId(response, requestId)
      }

      const response = await router.fetch(
        requestWithId,
        cloudflareEnvironment,
        context
      )
      return withRequestId(corsify(response, requestWithId), requestId)
    } catch (error: unknown) {
      sentry.captureException(error)
      const response = apiError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. The team has been notified.',
        requestId,
        retryable: true
      })
      return withRequestId(corsify(response, requestWithId), requestId)
    }
  }
}

function isWebSocketEndpointCalled(request: Request) {
  const webSocketEndpointRegex = /^\/[a-zA-Z0-9-]+\/websocket$/
  const pathname = new URL(request.url).pathname
  return webSocketEndpointRegex.test(pathname)
}
