import {
  credentialIdSchema,
  displayNameSchema,
  gamePlayerIdSchema,
  playerIdSchema,
  roomKeySchema
} from '@knucklebones/common'
import { type RequestWithId } from '../types/itty'
import { apiError } from './http'

export function validateRequestPath(
  request: Request & RequestWithId
): Response | undefined {
  let segments: string[]

  try {
    segments = new URL(request.url).pathname
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent)
  } catch {
    return invalidRouteParameters(request.requestId)
  }

  if (
    (segments[0] === 'players' || segments[0] === 'matchmaking') &&
    segments.length > 1
  ) {
    return playerIdSchema.safeParse(segments[1]).success
      ? undefined
      : invalidRouteParameters(request.requestId)
  }

  if (segments[0] === 'v1' && segments[1] === 'rooms') {
    return roomKeySchema.safeParse(segments[2]).success
      ? undefined
      : invalidRouteParameters(request.requestId)
  }

  if (segments[0] === 'v1' && segments[1] === 'identity') {
    if (
      request.method === 'DELETE' &&
      segments[2] === 'credentials' &&
      !credentialIdSchema.safeParse(segments[3]).success
    ) {
      return invalidRouteParameters(request.requestId)
    }

    return
  }

  if (segments.length >= 3) {
    const isValid =
      roomKeySchema.safeParse(segments[0]).success &&
      gamePlayerIdSchema.safeParse(segments[1]).success

    if (!isValid) {
      return invalidRouteParameters(request.requestId)
    }

    if (
      request.method === 'POST' &&
      segments[2] === 'displayName' &&
      !displayNameSchema.safeParse(segments[3]).success
    ) {
      return invalidRouteParameters(request.requestId)
    }
  }
}

export function invalidRouteParameters(requestId: string): Response {
  return apiError({
    status: 400,
    code: 'INVALID_ROUTE_PARAMETERS',
    message: 'The route parameters are invalid.',
    requestId
  })
}
