import { status } from 'itty-router'
import { Toucan } from 'toucan-js'
import { clientProtocolDiagnosticSchema } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type AuthenticatedRequestWithProps } from '../types/itty'
import { apiError, sanitizeRequestForSentry } from '../utils/http'
import { recordOperationalEvent } from '../utils/observability'
import { enforceRateLimit } from '../utils/rateLimit'

export async function reportClientProtocolDiagnostic(
  request: Request & AuthenticatedRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
): Promise<Response> {
  const diagnostic = clientProtocolDiagnosticSchema.safeParse(
    await request.json().catch(() => undefined)
  )
  if (!diagnostic.success) {
    return apiError({
      status: 400,
      code: 'INVALID_CLIENT_DIAGNOSTIC',
      message: 'The client diagnostic is invalid.',
      requestId: request.requestId
    })
  }

  const rateLimit = await enforceRateLimit(
    request,
    cloudflareEnvironment.PLAYERS_DB,
    {
      scope: 'client-protocol-diagnostic',
      identifier: request.principal.playerId,
      limit: 10,
      windowMs: 60 * 1000
    }
  )
  if (rateLimit !== undefined) {
    return rateLimit
  }

  const sentry = new Toucan({
    dsn: cloudflareEnvironment.SENTRY_DSN,
    context,
    request: sanitizeRequestForSentry(request, request.requestId)
  })
  sentry.setTag('request_id', request.requestId)
  sentry.setTag('client_diagnostic_code', diagnostic.data.code)
  sentry.captureMessage(
    `Client protocol diagnostic: ${diagnostic.data.code}.`,
    'warning'
  )
  recordOperationalEvent(cloudflareEnvironment.ENVIRONMENT, {
    event: 'client.protocol-diagnostic',
    outcome: 'reported',
    code: diagnostic.data.code
  })

  return status(204)
}
