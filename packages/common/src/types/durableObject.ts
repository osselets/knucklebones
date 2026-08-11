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

export interface ResignGameCommand {
  mutationId: string
  playerId: string
}

export type PresenceUpdateResult =
  | { status: 'disabled' | 'ignored' | 'unchanged' }
  | {
      status: 'updated'
      playerId: string
      connected: boolean
      reconnectDeadline?: number
    }
  | { status: 'adjudicated'; gameState: IGameState }

export type InitializeGameResult =
  | {
      status:
        | 'waiting'
        | 'not-assigned'
        | 'invalid-ranked-settings'
        | 'ranked-assignment-expired'
    }
  | { status: 'created' | 'existing'; gameState: IGameState }

export type RematchGameResult =
  | {
      status:
        | 'game-ongoing'
        | 'unchanged'
        | 'unknown-player'
        | 'ranked-rematch-disabled'
    }
  | { status: 'updated'; gameState: IGameState }

export type ResignGameResult =
  | {
      status:
        'game-not-initialized' | 'game-ended' | 'unknown-player' | 'not-ranked'
    }
  | { status: 'updated'; gameState: IGameState }

export type PlayGameResult =
  | { status: 'rejected'; reason: PlayIntentRejectionReason }
  | { status: 'updated'; gameState: IGameState }

export type GameStateMutationResult =
  InitializeGameResult | RematchGameResult | ResignGameResult | PlayGameResult

export type IdempotentMutationResult<T> =
  | { idempotencyStatus: 'applied' | 'replayed'; value: T }
  | { idempotencyStatus: 'conflict' }
