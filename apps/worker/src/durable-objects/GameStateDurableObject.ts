import { createDurable } from 'itty-durable'
import {
  type BoType,
  type Difficulty,
  type GameSettings,
  GameState,
  type IGameState,
  type ILobby,
  Lobby,
  Player,
  type Play,
  type PlayRejectionReason
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type IttyDurableObjectNamespace } from '../types/itty'

interface InitializeGameCommand {
  mutationId: string
  playerId: string
  displayName?: string
  difficulty?: Difficulty
  boType?: BoType
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
  | { status: 'rejected'; reason: PlayRejectionReason }
  | { status: 'updated'; gameState: IGameState }

export type IdempotentMutationResult<T> =
  | { idempotencyStatus: 'applied' | 'replayed'; value: T }
  | { idempotencyStatus: 'conflict' }

interface ProcessedMutation {
  fingerprint: string
  processedAt: number
  value: unknown
}

type ProcessedMutations = Record<string, ProcessedMutation>

const PROCESSED_MUTATION_TTL_MS = 15 * 60 * 1000
const MAX_PROCESSED_MUTATIONS = 200

export class GameStateDurableObject extends createDurable({
  autoPersist: true
}) {
  lobby: ILobby
  gameState?: IGameState
  processedMutations: ProcessedMutations

  constructor(
    state: DurableObjectState,
    cloudflareEnvironment: CloudflareEnvironment
  ) {
    super(state, cloudflareEnvironment)
    this.lobby = new Lobby().toJson()
    this.processedMutations = {}
  }

  initializeGame({
    mutationId,
    playerId,
    displayName,
    difficulty,
    boType
  }: InitializeGameCommand): IdempotentMutationResult<InitializeGameResult> {
    return this.runIdempotently(
      mutationId,
      'initialize-game',
      { playerId, displayName, difficulty, boType },
      () =>
        this.applyInitializeGame({ playerId, displayName, difficulty, boType })
    )
  }

  private applyInitializeGame({
    playerId,
    displayName,
    difficulty,
    boType
  }: Omit<InitializeGameCommand, 'mutationId'>): InitializeGameResult {
    if (this.gameState !== undefined) {
      const gameState = GameState.fromJson(this.gameState)
      let serializedGameState = gameState.toJson()

      if (gameState.addSpectator(playerId)) {
        serializedGameState = this.commitGameState(gameState)
      }

      return { status: 'existing', gameState: serializedGameState }
    }

    const lobby = Lobby.fromJson(this.lobby)
    const player = new Player(playerId, displayName, difficulty)

    if (boType !== undefined) {
      lobby.setBoType(boType)
    }

    if (lobby.addPlayer(player)) {
      this.lobby = lobby.toJson()
    }

    if (!lobby.isReady()) {
      return { status: 'waiting' }
    }

    const gameState = this.commitGameState(lobby.toGameState())

    return { status: 'created', gameState }
  }

  play(
    mutationId: string,
    play: Play
  ): IdempotentMutationResult<PlayGameResult> {
    return this.runIdempotently(mutationId, 'play', play, () =>
      this.applyPlay(play)
    )
  }

  private applyPlay(play: Play): PlayGameResult {
    const gameState = this.getInitializedGameState()
    const rejectionReason = gameState.getPlayRejectionReason(play)

    if (rejectionReason !== undefined) {
      return { status: 'rejected', reason: rejectionReason }
    }

    gameState.applyPlay(play)
    return { status: 'updated', gameState: this.commitGameState(gameState) }
  }

  rematch(
    mutationId: string,
    playerId: string,
    gameSettings?: Partial<Omit<GameSettings, 'playerType'>>
  ): IdempotentMutationResult<RematchGameResult> {
    return this.runIdempotently(
      mutationId,
      'rematch',
      { playerId, gameSettings },
      () => this.applyRematch(playerId, gameSettings)
    )
  }

  private applyRematch(
    playerId: string,
    gameSettings?: Partial<Omit<GameSettings, 'playerType'>>
  ): RematchGameResult {
    const gameState = this.getInitializedGameState()

    if (gameState.outcome === 'ongoing') {
      return { status: 'game-ongoing' }
    }

    if (
      (gameState.rematchVote === undefined && gameState.playerTwo.isAi()) ||
      (gameState.rematchVote !== undefined &&
        gameState.rematchVote !== playerId)
    ) {
      const newGameState = new GameState({
        playerOne: new Player(
          gameState.playerOne.id,
          gameState.playerOne.displayName
        ),
        playerTwo: new Player(
          gameState.playerTwo.id,
          gameState.playerTwo.displayName,
          gameState.playerTwo.difficulty
        )
      })
      newGameState.initialize({ ...gameState, ...gameSettings })
      return {
        status: 'updated',
        gameState: this.commitGameState(newGameState)
      }
    }

    if (gameState.rematchVote === undefined) {
      gameState.rematchVote = playerId
      return {
        status: 'updated',
        gameState: this.commitGameState(gameState)
      }
    }

    return { status: 'unchanged' }
  }

  updateDisplayName(
    mutationId: string,
    playerId: string,
    displayName?: string
  ): IdempotentMutationResult<UpdateDisplayNameResult> {
    return this.runIdempotently(
      mutationId,
      'update-display-name',
      { playerId, displayName },
      () => this.applyDisplayNameUpdate(playerId, displayName)
    )
  }

  private applyDisplayNameUpdate(
    playerId: string,
    displayName?: string
  ): UpdateDisplayNameResult {
    const gameState = this.getInitializedGameState()

    if (gameState.playerOne.id === playerId) {
      gameState.playerOne.displayName = displayName
    } else if (gameState.playerTwo.id === playerId) {
      gameState.playerTwo.displayName = displayName
    } else {
      return { status: 'unknown-player' }
    }

    return {
      status: 'updated',
      gameState: this.commitGameState(gameState)
    }
  }

  private commitGameState(gameState: GameState): IGameState {
    gameState.revision = (this.gameState?.revision ?? 0) + 1
    this.gameState = gameState.toJson()
    return this.gameState
  }

  private getInitializedGameState(): GameState {
    if (this.gameState === undefined) {
      throw new Error('Game state is not initialized.')
    }

    return GameState.fromJson(this.gameState)
  }

  private runIdempotently<T>(
    mutationId: string,
    operation: string,
    payload: unknown,
    mutation: () => T
  ): IdempotentMutationResult<T> {
    const fingerprint = JSON.stringify({ operation, payload })
    const processedMutation = this.processedMutations[mutationId]

    if (processedMutation !== undefined) {
      if (processedMutation.fingerprint !== fingerprint) {
        return { idempotencyStatus: 'conflict' }
      }

      return {
        idempotencyStatus: 'replayed',
        value: processedMutation.value as T
      }
    }

    const value = mutation()
    const processedAt = Date.now()
    const activeMutations = Object.entries(this.processedMutations)
      .filter(
        ([, processed]) =>
          processed.processedAt > processedAt - PROCESSED_MUTATION_TTL_MS
      )
      .sort(([, left], [, right]) => right.processedAt - left.processedAt)
      .slice(0, MAX_PROCESSED_MUTATIONS - 1)

    this.processedMutations = Object.fromEntries([
      [mutationId, { fingerprint, processedAt, value }],
      ...activeMutations
    ])

    return { idempotencyStatus: 'applied', value }
  }
}

export interface GameStateDurableObjectProps {
  GAME_STATE_DURABLE_OBJECT: IttyDurableObjectNamespace<GameStateDurableObject>
}
