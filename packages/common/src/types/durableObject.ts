import { type IGameState } from '../interfaces'
import { type BoType, type Difficulty, type GameSettings } from './gameSettings'
import { type PlayIntentRejectionReason } from './play'

export interface InitializeGameCommand {
  mutationId: string
  playerId: string
  displayName?: string
  difficulty?: Difficulty
  boType?: BoType
}

export interface PlayGameCommand {
  mutationId: string
  actorId: string
  column: number
  expectedRevision?: number
}

export interface RematchGameCommand {
  mutationId: string
  playerId: string
  gameSettings?: Partial<Omit<GameSettings, 'playerType'>>
}

export interface UpdateDisplayNameCommand {
  mutationId: string
  playerId: string
  displayName?: string
}

export type InitializeGameResult =
  | { status: 'waiting' }
  | { status: 'created' | 'existing'; gameState: IGameState }

export type RematchGameResult =
  | { status: 'game-ongoing' | 'unchanged' }
  | { status: 'updated'; gameState: IGameState }

export type UpdateDisplayNameResult =
  { status: 'unknown-player' } | { status: 'updated'; gameState: IGameState }

export type PlayGameResult =
  | { status: 'rejected'; reason: PlayIntentRejectionReason }
  | { status: 'updated'; gameState: IGameState }

export type GameStateMutationResult =
  | InitializeGameResult
  | RematchGameResult
  | UpdateDisplayNameResult
  | PlayGameResult

export type IdempotentMutationResult<T> =
  | { idempotencyStatus: 'applied' | 'replayed'; value: T }
  | { idempotencyStatus: 'conflict' }
