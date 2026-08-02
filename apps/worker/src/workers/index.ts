import { withDurables } from 'itty-durable'
import { Router, cors, withParams } from 'itty-router'
import { Toucan } from 'toucan-js'
import {
  acceptMatchmaking,
  createPlayer,
  createWebSocketTicket,
  deleteRoomDisplayName,
  deleteDisplayName,
  displayName,
  getRankedProfile,
  getRankedRematchStatus,
  getRankedAvailability,
  getMatchmakingStatus,
  init,
  initializeRoom,
  createIdentityTransfer,
  joinMatchmaking,
  leaveMatchmaking,
  listDeviceCredentials,
  play,
  playIntent,
  reportClientProtocolDiagnostic,
  rematch,
  rematchRoom,
  requestRankedRematch,
  resignRoom,
  redeemIdentityTransfer,
  redeemIdentityRecovery,
  revokeDeviceCredential,
  revokeOtherDeviceCredentials,
  rotateDeviceCredential,
  rotateIdentityRecovery,
  updateRoomDisplayName,
  verifyPlayer,
  webSocket
} from '../endpoints'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type RequestWithId } from '../types/itty'
import { authenticatePlayerRequest } from '../utils/authentication'
import {
  apiError,
  resolveFrontendOrigin,
  sanitizeRequestForSentry,
  withRequestId
} from '../utils/http'
import {
  withAuthenticatedMutationId,
  withMutationId
} from '../utils/idempotency'
import { recordHttpRequest } from '../utils/observability'
import { validateRequestPath } from '../utils/validation'

export { GameStateDurableObject } from '../durable-objects/GameStateDurableObject'
export { MatchmakingDurableObject } from '../durable-objects/MatchmakingDurableObject'
export { WebSocketDurableObject } from '../durable-objects/WebSocketDurableObject'

const router = Router()

router
  .all('*', applyCorsPreflight, withParams)

  .post('/players', createPlayer)
  .post('/v1/identity/transfers/redeem', redeemIdentityTransfer)
  .post('/v1/identity/recovery/redeem', redeemIdentityRecovery)
  .all('/v1/diagnostics/*', authenticatePlayerRequest)
  .post('/v1/diagnostics/protocol', reportClientProtocolDiagnostic)
  .all('/v1/identity/*', authenticatePlayerRequest)
  .post('/v1/identity/verify', verifyPlayer)
  .post('/v1/identity/transfers', createIdentityTransfer)
  .post('/v1/identity/recovery/rotate', rotateIdentityRecovery)
  .get('/v1/identity/credentials', listDeviceCredentials)
  .post('/v1/identity/credentials/rotate', rotateDeviceCredential)
  .post('/v1/identity/credentials/revoke-others', revokeOtherDeviceCredentials)
  .delete('/v1/identity/credentials/:credentialId', revokeDeviceCredential)
  .all('/v1/ranked/*', authenticatePlayerRequest)
  .get('/v1/ranked/availability', getRankedAvailability)
  .get('/v1/ranked/profile', getRankedProfile)
  .all('/v1/matchmaking/*', authenticatePlayerRequest)
  .post('/v1/matchmaking/join', joinMatchmaking)
  .get('/v1/matchmaking/status', getMatchmakingStatus)
  .post('/v1/matchmaking/accept', acceptMatchmaking)
  .delete('/v1/matchmaking/queue', leaveMatchmaking)
  .all('/players/:playerId/*', authenticatePlayerRequest)
  .post('/players/:playerId/verify', verifyPlayer)
  .get('/players/:playerId/rating', getRankedProfile)
  .all('/matchmaking/:playerId/*', authenticatePlayerRequest)
  .post('/matchmaking/:playerId/join', joinMatchmaking)
  .get('/matchmaking/:playerId/status', getMatchmakingStatus)
  .post('/matchmaking/:playerId/accept', acceptMatchmaking)
  .delete('/matchmaking/:playerId/queue', leaveMatchmaking)
  .all(
    '/v1/rooms/:roomKey/*',
    withDurables({ parse: true }),
    authenticatePlayerRequest
  )
  .post('/v1/rooms/:roomKey/websocket-ticket', createWebSocketTicket)
  .post('/v1/rooms/:roomKey/init', withAuthenticatedMutationId, initializeRoom)
  .post('/v1/rooms/:roomKey/play', withAuthenticatedMutationId, playIntent)
  .post('/v1/rooms/:roomKey/rematch', withAuthenticatedMutationId, rematchRoom)
  .get('/v1/rooms/:roomKey/ranked-rematch', getRankedRematchStatus)
  .post(
    '/v1/rooms/:roomKey/ranked-rematch',
    withAuthenticatedMutationId,
    requestRankedRematch
  )
  .post('/v1/rooms/:roomKey/resign', withAuthenticatedMutationId, resignRoom)
  .post(
    '/v1/rooms/:roomKey/display-name',
    withAuthenticatedMutationId,
    updateRoomDisplayName
  )
  .delete(
    '/v1/rooms/:roomKey/display-name',
    withAuthenticatedMutationId,
    deleteRoomDisplayName
  )
  .all(
    '/:roomKey/:playerId/*',
    withDurables({ parse: true }),
    authenticatePlayerRequest
  )
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
    const startedAt = Date.now()
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
    const { corsify } = createCors(cloudflareEnvironment.ENVIRONMENT)
    const finalize = (response: Response) => {
      const finalizedResponse = withRequestId(
        corsify(response, requestWithId),
        requestId
      )
      recordHttpRequest({
        request,
        response: finalizedResponse,
        requestId,
        environment: cloudflareEnvironment.ENVIRONMENT,
        startedAt
      })
      return finalizedResponse
    }

    try {
      if (isWebSocketEndpointCalled(requestWithId)) {
        const response = await webSocket(requestWithId, cloudflareEnvironment)
        return finalize(response)
      }

      const invalidPathResponse = validateRequestPath(requestWithId)
      if (invalidPathResponse !== undefined) {
        return finalize(invalidPathResponse)
      }

      const response = await router.fetch(
        requestWithId,
        cloudflareEnvironment,
        context
      )
      return finalize(response)
    } catch (error: unknown) {
      sentry.captureException(error)
      const response = apiError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. The team has been notified.',
        requestId,
        retryable: true
      })
      return finalize(response)
    }
  }
}

function createCors(environment: CloudflareEnvironment['ENVIRONMENT']) {
  return cors({
    origin: (origin) => resolveFrontendOrigin(origin, environment),
    allowMethods: ['GET', 'POST', 'DELETE'],
    allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    exposeHeaders: ['X-Request-Id']
  })
}

function applyCorsPreflight(
  request: Request,
  cloudflareEnvironment: CloudflareEnvironment
) {
  return createCors(cloudflareEnvironment.ENVIRONMENT).preflight(request)
}

function isWebSocketEndpointCalled(request: Request) {
  const webSocketEndpointRegex = /^\/[a-zA-Z0-9-]+\/websocket$/
  const pathname = new URL(request.url).pathname
  return webSocketEndpointRegex.test(pathname)
}
