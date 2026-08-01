import {
  GameState,
  gameStateSchema,
  type IGameState,
  type PlayGameCommand,
  type PlayIntentRejectionReason
} from '@knucklebones/common'

type AuthoritativePlayResult =
  | { status: 'rejected'; reason: PlayIntentRejectionReason }
  | { status: 'updated'; gameState: GameState }

export function applyPlayCommand(
  serializedGameState: IGameState | undefined,
  command: PlayGameCommand
): AuthoritativePlayResult {
  if (serializedGameState === undefined) {
    return { status: 'rejected', reason: 'game-not-initialized' }
  }

  const parsedGameState = gameStateSchema.safeParse(serializedGameState)
  if (!parsedGameState.success) {
    return { status: 'rejected', reason: 'invalid-game-state' }
  }

  const gameState = GameState.fromJson(parsedGameState.data)

  if (
    command.expectedRevision !== undefined &&
    command.expectedRevision !== gameState.revision
  ) {
    return { status: 'rejected', reason: 'stale-revision' }
  }

  const rejectionReason = gameState.applyPlayIntent(
    command.actorId,
    command.column
  )
  if (rejectionReason !== undefined) {
    return { status: 'rejected', reason: rejectionReason }
  }

  return { status: 'updated', gameState }
}
