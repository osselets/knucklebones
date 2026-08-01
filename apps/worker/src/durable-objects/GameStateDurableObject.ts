import { createDurable } from 'itty-durable'
import {
  type GameSettings,
  GameState,
  gameStateSchema,
  type IGameState,
  type ILobby,
  type IdempotentMutationResult,
  type InitializeGameCommand,
  type InitializeGameResult,
  initializeGameCommandSchema,
  initializeGameResultSchema,
  Lobby,
  lobbySchema,
  Player,
  type Play,
  type PlayGameResult,
  playGameCommandSchema,
  playGameResultSchema,
  type RematchGameResult,
  rematchGameCommandSchema,
  rematchGameResultSchema,
  type UpdateDisplayNameResult,
  updateDisplayNameCommandSchema,
  updateDisplayNameResultSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type IttyDurableObjectNamespace } from '../types/itty'

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
    const command = initializeGameCommandSchema.parse({
      mutationId,
      playerId,
      displayName,
      difficulty,
      boType
    })

    return this.runIdempotently(
      command.mutationId,
      'initialize-game',
      {
        playerId: command.playerId,
        displayName: command.displayName,
        difficulty: command.difficulty,
        boType: command.boType
      },
      initializeGameResultSchema,
      () =>
        this.applyInitializeGame({
          playerId: command.playerId,
          displayName: command.displayName,
          difficulty: command.difficulty,
          boType: command.boType
        })
    )
  }

  private applyInitializeGame({
    playerId,
    displayName,
    difficulty,
    boType
  }: Omit<InitializeGameCommand, 'mutationId'>): InitializeGameResult {
    if (this.gameState !== undefined) {
      const gameState = GameState.fromJson(
        gameStateSchema.parse(this.gameState)
      )
      let serializedGameState = gameState.toJson()

      if (gameState.addSpectator(playerId)) {
        serializedGameState = this.commitGameState(gameState)
      }

      return { status: 'existing', gameState: serializedGameState }
    }

    const lobby = Lobby.fromJson(lobbySchema.parse(this.lobby))
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
    const command = playGameCommandSchema.parse({ mutationId, play })

    return this.runIdempotently(
      command.mutationId,
      'play',
      command.play,
      playGameResultSchema,
      () => this.applyPlay(command.play)
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
    const command = rematchGameCommandSchema.parse({
      mutationId,
      playerId,
      gameSettings
    })

    return this.runIdempotently(
      command.mutationId,
      'rematch',
      {
        playerId: command.playerId,
        gameSettings: command.gameSettings
      },
      rematchGameResultSchema,
      () => this.applyRematch(command.playerId, command.gameSettings)
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
    const command = updateDisplayNameCommandSchema.parse({
      mutationId,
      playerId,
      displayName
    })

    return this.runIdempotently(
      command.mutationId,
      'update-display-name',
      { playerId: command.playerId, displayName: command.displayName },
      updateDisplayNameResultSchema,
      () => this.applyDisplayNameUpdate(command.playerId, command.displayName)
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

    return GameState.fromJson(gameStateSchema.parse(this.gameState))
  }

  private runIdempotently<T>(
    mutationId: string,
    operation: string,
    payload: unknown,
    resultSchema: { parse(value: unknown): T },
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
        value: resultSchema.parse(processedMutation.value)
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
