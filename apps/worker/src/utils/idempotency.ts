import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import {
  type AuthenticatedMutationRoomRequestWithProps,
  type MutationRequestWithProps,
  type RequestWithId,
  type RequestWithMutationId
} from '../types/itty'
import { apiError } from './http'

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type MutationMiddleware<TRequest> = (
  request: Request & TRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) => Response | undefined

function assignMutationId(
  request: Request & RequestWithId & Partial<RequestWithMutationId>
): Response | undefined {
  const mutationId = request.headers.get('Idempotency-Key')

  if (mutationId === null) {
    request.mutationId = crypto.randomUUID()
    return
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(mutationId)) {
    return apiError({
      status: 400,
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'The Idempotency-Key header must be a valid UUID.',
      requestId: request.requestId
    })
  }

  request.mutationId = mutationId
}

export const withMutationId: MutationMiddleware<MutationRequestWithProps> =
  assignMutationId

export const withAuthenticatedMutationId: MutationMiddleware<AuthenticatedMutationRoomRequestWithProps> =
  assignMutationId

export function idempotencyConflict(requestId: string): Response {
  return apiError({
    status: 409,
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'The idempotency key was already used for another mutation.',
    requestId
  })
}
