import { status } from 'itty-router'
import {
  GameState,
  playIntentSchema,
  playRouteParamsSchema,
  type PlayIntentRejectionReason
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import {
  type AuthenticatedMutationRoomRequestWithProps,
  type MutationRequestWithProps
} from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import { broadcastGameState } from '../utils/endpoints'
import { apiError } from '../utils/http'
import { idempotencyConflict } from '../utils/idempotency'
import { applyAuthoritativePlay } from '../utils/play'
import { invalidRouteParameters } from '../utils/validation'

interface LegacyPlayRequest extends MutationRequestWithProps {
  dice?: string
  column?: string
}

export async function play(
  request: LegacyPlayRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const params = playRouteParamsSchema.safeParse({
    roomKey: request.roomKey,
    playerId: request.playerId,
    column: request.column,
    dice: request.dice
  })
  if (!params.success) {
    return invalidRouteParameters(request.requestId)
  }

  return await executePlayIntent(
    request,
    request.principal.playerId,
    Number(params.data.column),
    cloudflareEnvironment,
    context
  )
}

export async function playIntent(
  request: Request & AuthenticatedMutationRoomRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const body = playIntentSchema.safeParse(
    await request.json().catch(() => undefined)
  )
  if (!body.success) {
    return apiError({
      status: 400,
      code: 'INVALID_PLAY_INTENT',
      message: 'The play intent must contain a column between 0 and 2.',
      requestId: request.requestId
    })
  }

  return await executePlayIntent(
    request,
    request.principal.playerId,
    body.data.column,
    cloudflareEnvironment,
    context
  )
}

async function executePlayIntent(
  request: AuthenticatedMutationRoomRequestWithProps,
  actorId: string,
  column: number,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const result = await applyAuthoritativePlay(request, actorId, column)

  if (result.idempotencyStatus === 'conflict') {
    return idempotencyConflict(request.requestId)
  }

  const mutation = result.value
  if (mutation.status === 'rejected') {
    return playError(mutation.reason, request.requestId)
  }

  const gameState = GameState.fromJson(mutation.gameState)
  await broadcastGameState(mutation.gameState, request, cloudflareEnvironment)

  if (
    gameState.outcome === 'ongoing' &&
    gameState.playerTwo.isAi() &&
    gameState.nextPlayer.equals(gameState.playerTwo)
  ) {
    makeAiPlay(gameState, request, cloudflareEnvironment, context)
  }

  return status(200)
}

function playError(
  reason: PlayIntentRejectionReason,
  requestId: string
): Response {
  switch (reason) {
    case 'game-not-initialized':
      return apiError({
        status: 409,
        code: 'GAME_NOT_INITIALIZED',
        message: 'The game has not started yet.',
        requestId
      })
    case 'game-ended':
      return apiError({
        status: 409,
        code: 'GAME_ALREADY_FINISHED',
        message: 'The game has already ended.',
        requestId
      })
    case 'unknown-player':
      return apiError({
        status: 403,
        code: 'NOT_A_PLAYER',
        message: 'Only a player in this game can make a move.',
        requestId
      })
    case 'not-player-turn':
      return apiError({
        status: 409,
        code: 'NOT_YOUR_TURN',
        message: "It is not this player's turn.",
        requestId
      })
    case 'invalid-column':
      return apiError({
        status: 400,
        code: 'INVALID_COLUMN',
        message: 'The column must be an integer between 0 and 2.',
        requestId
      })
    case 'column-full':
      return apiError({
        status: 409,
        code: 'COLUMN_FULL',
        message: 'The selected column is already full.',
        requestId
      })
    case 'invalid-game-state':
      return apiError({
        status: 409,
        code: 'INVALID_GAME_STATE',
        message: 'The authoritative game state is invalid.',
        requestId
      })
    case 'stale-revision':
      return apiError({
        status: 409,
        code: 'STALE_REVISION',
        message: 'The game state changed before the move was applied.',
        requestId
      })
  }
}
