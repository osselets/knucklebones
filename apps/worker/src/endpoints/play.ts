import { status } from 'itty-router'
import {
  GameState,
  idempotentPlayGameResultSchema,
  playRouteParamsSchema,
  type PlayRejectionReason
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type MutationRequestWithProps } from '../types/itty'
import { makeAiPlay } from '../utils/ai'
import {
  broadcastGameState,
  getGameStateDurableObject
} from '../utils/endpoints'
import { apiError } from '../utils/http'
import { idempotencyConflict } from '../utils/idempotency'
import { invalidRouteParameters } from '../utils/validation'

interface PlayRequest extends MutationRequestWithProps {
  dice?: number
  column?: number
}

export async function play(
  request: PlayRequest,
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

  const play = {
    dice: Number(params.data.dice),
    column: Number(params.data.column),
    author: request.playerId
  }

  const result = idempotentPlayGameResultSchema.parse(
    await getGameStateDurableObject(request).play(request.mutationId, play)
  )

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

function playError(reason: PlayRejectionReason, requestId: string): Response {
  switch (reason) {
    case 'game-ended':
      return apiError({
        status: 409,
        code: 'GAME_ENDED',
        message: 'The game has already ended.',
        requestId
      })
    case 'unknown-player':
      return apiError({
        status: 403,
        code: 'PLAYER_NOT_IN_GAME',
        message: 'Only a player in this game can make a move.',
        requestId
      })
    case 'not-player-turn':
      return apiError({
        status: 409,
        code: 'NOT_PLAYER_TURN',
        message: "It is not this player's turn.",
        requestId
      })
    case 'unexpected-die':
      return apiError({
        status: 409,
        code: 'DIE_MISMATCH',
        message: 'The submitted die does not match the current turn.',
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
  }
}
