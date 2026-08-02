import { DEFAULT_RATING_POOL, RANKED_QUEUE_KEY } from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type AuthenticatedRequestWithProps } from '../types/itty'
import { apiError } from '../utils/http'

type MatchmakingRequest = AuthenticatedRequestWithProps

interface RatingRow {
  rating: number
}

export async function joinMatchmaking(
  request: Request & MatchmakingRequest,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  const playerId = request.principal.playerId
  const profile = await cloudflareEnvironment.PLAYERS_DB.prepare(
    'SELECT rating FROM player_ratings WHERE player_id = ? AND rating_pool = ?'
  )
    .bind(playerId, DEFAULT_RATING_POOL)
    .first<RatingRow>()

  if (profile === null) {
    return apiError({
      status: 404,
      code: 'RANKED_PROFILE_NOT_FOUND',
      message: 'The ranked player profile was not found.',
      requestId: request.requestId
    })
  }

  if (!Number.isInteger(profile.rating)) {
    throw new Error('The stored ranked player rating is invalid.')
  }

  return await fetchMatchmakingObject(
    request,
    playerId,
    cloudflareEnvironment,
    '/join',
    {
      method: 'POST',
      headers: { 'X-Player-Rating': String(profile.rating) }
    }
  )
}

export async function getMatchmakingStatus(
  request: Request & MatchmakingRequest,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  return await fetchMatchmakingObject(
    request,
    request.principal.playerId,
    cloudflareEnvironment,
    '/status'
  )
}

export async function leaveMatchmaking(
  request: Request & MatchmakingRequest,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<Response> {
  return await fetchMatchmakingObject(
    request,
    request.principal.playerId,
    cloudflareEnvironment,
    '/queue',
    { method: 'DELETE' }
  )
}

async function fetchMatchmakingObject(
  request: Request & MatchmakingRequest,
  playerId: string,
  cloudflareEnvironment: CloudflareEnvironment,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const id =
    cloudflareEnvironment.MATCHMAKING_DURABLE_OBJECT.idFromName(
      RANKED_QUEUE_KEY
    )
  const matchmaking = cloudflareEnvironment.MATCHMAKING_DURABLE_OBJECT.get(id)
  const headers = new Headers(init?.headers)
  headers.set('X-Player-Id', playerId)
  headers.set('X-Request-Id', request.requestId)

  return await matchmaking.fetch(`https://dummy-url${path}`, {
    ...init,
    headers
  })
}
