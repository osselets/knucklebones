import { status } from 'itty-router'
import {
  AI_PLAYER_ID,
  GameState,
  idempotentInitializeGameResultSchema,
  initGameQuerySchema,
  initializeRoomSchema,
  type BoType,
  type Difficulty
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

export interface InitRequest extends MutationRequestWithProps {
  query?: GameSettingsQuery
}

export async function init(
  request: InitRequest,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const query = initGameQuerySchema.safeParse(request.query ?? {})
  if (!query.success) {
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

  return await executeInitializeGame(
    request,
    {
      playerId: request.playerId,
      displayName: await getPlayerDisplayName(
        request.playerId,
        cloudflareEnvironment
      ),
      difficulty: gameSettings.value.difficulty,
      boType: gameSettings.value.boType
    },
    cloudflareEnvironment,
    context
  )
}

export async function initializeRoom(
  request: Request & AuthenticatedMutationRoomRequestWithProps,
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const body = initializeRoomSchema.safeParse(
    await request.json().catch(() => undefined)
  )
  if (!body.success) {
    return apiError({
      status: 400,
      code: 'INVALID_INITIALIZE_GAME_REQUEST',
      message: 'The game initialization request is invalid.',
      requestId: request.requestId
    })
  }

  return await executeInitializeGame(
    request,
    {
      playerId:
        body.data.playerType === 'ai'
          ? AI_PLAYER_ID
          : request.principal.playerId,
      displayName:
        body.data.playerType === 'human'
          ? await getPlayerDisplayName(
              request.principal.playerId,
              cloudflareEnvironment
            )
          : undefined,
      difficulty:
        body.data.playerType === 'ai' ? body.data.difficulty : undefined,
      boType: body.data.boType
    },
    cloudflareEnvironment,
    context
  )
}

interface PlayerDisplayNameRow {
  display_name: string
}

async function getPlayerDisplayName(
  playerId: string,
  cloudflareEnvironment: CloudflareEnvironment
): Promise<string | undefined> {
  if (playerId === AI_PLAYER_ID) {
    return undefined
  }

  const player = await cloudflareEnvironment.PLAYERS_DB.prepare(
    'SELECT display_name FROM players WHERE player_id = ?'
  )
    .bind(playerId)
    .first<PlayerDisplayNameRow>()

  if (player === null) {
    throw new Error('The game player profile was not found.')
  }

  return player.display_name
}

async function executeInitializeGame(
  request: AuthenticatedMutationRoomRequestWithProps,
  player: {
    playerId: string
    displayName?: string
    difficulty?: Difficulty
    boType?: BoType
  },
  cloudflareEnvironment: CloudflareEnvironment,
  context: ExecutionContext
) {
  const result = idempotentInitializeGameResultSchema.parse(
    await getGameStateDurableObject(request).initializeGame({
      mutationId: request.mutationId,
      ...player
    })
  )

  if (result.idempotencyStatus === 'conflict') {
    return idempotencyConflict(request.requestId)
  }

  const mutation = result.value

  if (mutation.status === 'not-assigned') {
    return apiError({
      status: 403,
      code: 'NOT_ASSIGNED_TO_RANKED_MATCH',
      message: 'This player is not assigned to the ranked match.',
      requestId: request.requestId
    })
  }

  if (mutation.status === 'invalid-ranked-settings') {
    return apiError({
      status: 409,
      code: 'RANKED_SETTINGS_LOCKED',
      message: 'Ranked match settings cannot be changed.',
      requestId: request.requestId
    })
  }

  if (mutation.status === 'ranked-assignment-expired') {
    return apiError({
      status: 409,
      code: 'RANKED_ASSIGNMENT_EXPIRED',
      message: 'The ranked match assignment has expired.',
      requestId: request.requestId
    })
  }

  if (mutation.status === 'created' || mutation.status === 'existing') {
    const gameState = GameState.fromJson(mutation.gameState)
    await broadcastGameState(mutation.gameState, request, cloudflareEnvironment)

    if (
      gameState.playerTwo.isAi() &&
      gameState.nextPlayer.equals(gameState.playerTwo)
    ) {
      makeAiPlay(gameState, request, cloudflareEnvironment, context)
    }
  }

  return status(200)
}
