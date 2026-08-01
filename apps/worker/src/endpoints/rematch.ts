import { status } from 'itty-router'
import {
  GameState,
  gameSettingsQuerySchema,
  idempotentRematchGameResultSchema,
  rematchRoomSchema,
  type GameSettings
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import {
  type AuthenticatedMutationRoomRequestWithProps,
  type MutationRequestWithProps
} from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'
import {
  type GameSettingsQuery,
  parseGameSettingsQuery
} from '../utils/gameSettings'
import { apiError } from '../utils/http'
import { idempotencyConflict } from '../utils/idempotency'

export interface RematchRequest extends MutationRequestWithProps {
  query?: GameSettingsQuery
}

export async function rematch(
  request: RematchRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  if (!gameSettingsQuerySchema.safeParse(request.query ?? {}).success) {
    return apiError({
      status: 400,
      code: 'INVALID_GAME_SETTINGS',
      message: 'The game settings are invalid.',
      requestId: request.requestId
    })
  }

  const gameSettings = parseGameSettingsQuery(request.query)

  if (!gameSettings.success) {
    return apiError({
      status: 400,
      code: 'INVALID_GAME_SETTINGS',
      message: 'The game settings are invalid.',
      requestId: request.requestId
    })
  }

  return await executeRematch(
    request,
    request.playerId,
    gameSettings.value,
    cloudflareEnvironment,
    context
  )
}

export async function rematchRoom(
  request: Request & AuthenticatedMutationRoomRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const body = rematchRoomSchema.safeParse(
    await request.json().catch(() => undefined)
  )
  if (!body.success) {
    return apiError({
      status: 400,
      code: 'INVALID_REMATCH_REQUEST',
      message: 'The rematch request is invalid.',
      requestId: request.requestId
    })
  }

  return await executeRematch(
    request,
    request.principal.playerId,
    body.data,
    cloudflareEnvironment,
    context
  )
}

async function executeRematch(
  request: AuthenticatedMutationRoomRequestWithProps,
  playerId: string,
  gameSettings: Partial<Omit<GameSettings, 'playerType'>>,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const result = idempotentRematchGameResultSchema.parse(
    await getGameStateDurableObject(request).rematch(
      request.mutationId,
      playerId,
      gameSettings
    )
  )

  if (result.idempotencyStatus === 'conflict') {
    return idempotencyConflict(request.requestId)
  }

  const mutation = result.value

  if (mutation.status === 'game-ongoing') {
    return apiError({
      status: 409,
      code: 'GAME_STILL_ONGOING',
      message: "The game is still ongoing. Can't rematch.",
      requestId: request.requestId
    })
  }

  if (mutation.status === 'unknown-player') {
    return apiError({
      status: 403,
      code: 'NOT_A_PLAYER',
      message: 'Only a player in this game can request a rematch.',
      requestId: request.requestId
    })
  }

  if (mutation.status === 'ranked-rematch-disabled') {
    return apiError({
      status: 409,
      code: 'RANKED_REMATCH_DISABLED',
      message: 'Ranked BO1 matches cannot be rematched in the same room.',
      requestId: request.requestId
    })
  }

  if (mutation.status === 'updated') {
    const gameState = GameState.fromJson(mutation.gameState)
    await broadcastGameState(mutation.gameState, request, cloudflareEnvironment)

    if (
      gameState.outcome === 'ongoing' &&
      gameState.playerTwo.isAi() &&
      gameState.nextPlayer.equals(gameState.playerTwo)
    ) {
      makeAiPlay(gameState, request, cloudflareEnvironment, context)
    }
  }

  return status(200)
}
