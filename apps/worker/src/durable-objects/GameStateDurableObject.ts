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
  type PlayGameCommand,
  type PlayGameResult,
  playGameCommandSchema,
  playGameResultSchema,
  playerIdSchema,
  type PresenceUpdateResult,
  type RematchGameResult,
  rematchGameCommandSchema,
  rematchGameResultSchema,
  roomKeySchema,
  toGameStateMessage,
  type UpdateDisplayNameResult,
  updateDisplayNameCommandSchema,
  updateDisplayNameResultSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type IttyDurableObjectNamespace } from '../types/itty'
import { applyPlayCommand } from '../utils/authoritativeGame'

interface ProcessedMutation {
  fingerprint: string
  processedAt: number
  value: unknown
}

type ProcessedMutations = Record<string, ProcessedMutation>

const PROCESSED_MUTATION_TTL_MS = 15 * 60 * 1000
const MAX_PROCESSED_MUTATIONS = 200
const DEFAULT_DISCONNECT_GRACE_MS = 60_000

interface DisconnectPolicy {
  roomKey: string
  gracePeriodMs: number
}

export class GameStateDurableObject extends createDurable({
  autoPersist: true
}) {
  lobby: ILobby
  gameState?: IGameState
  processedMutations: ProcessedMutations
  disconnectPolicy?: DisconnectPolicy
  connectedPlayers: Record<string, boolean>
  reconnectDeadlines: Record<string, number>
  pendingDisconnectBroadcast?: IGameState

  constructor(
    state: DurableObjectState,
    cloudflareEnvironment: CloudflareEnvironment
  ) {
    super(state, cloudflareEnvironment)
    this.lobby = new Lobby().toJson()
    this.processedMutations = {}
    this.connectedPlayers = {}
    this.reconnectDeadlines = {}
  }

  configureDisconnectPolicy(
    roomKey: string,
    gracePeriodMs = DEFAULT_DISCONNECT_GRACE_MS
  ): void {
    this.disconnectPolicy = {
      roomKey: roomKeySchema.parse(roomKey),
      gracePeriodMs: Number.isInteger(gracePeriodMs)
        ? Math.min(Math.max(gracePeriodMs, 1), 5 * 60_000)
        : DEFAULT_DISCONNECT_GRACE_MS
    }
  }

  async updatePresence(
    playerId: string,
    connected: boolean,
    observedAt = Date.now()
  ): Promise<PresenceUpdateResult> {
    const parsedPlayerId = playerIdSchema.parse(playerId)
    if (typeof connected !== 'boolean' || !Number.isInteger(observedAt)) {
      throw new Error('Invalid presence update.')
    }
    if (this.disconnectPolicy === undefined) {
      return { status: 'disabled' }
    }

    const gameState = this.readPlayerGameState(parsedPlayerId)
    if (gameState === undefined || gameState.outcome !== 'ongoing') {
      return { status: 'ignored' }
    }

    if (connected) {
      const hadDeadline = this.reconnectDeadlines[parsedPlayerId] !== undefined
      const changed = this.connectedPlayers[parsedPlayerId] !== true
      this.connectedPlayers[parsedPlayerId] = true
      delete this.reconnectDeadlines[parsedPlayerId]

      const adjudication = this.adjudicateDisconnects(observedAt)
      await this.scheduleDisconnectAlarm()
      if (adjudication.status === 'adjudicated') {
        return adjudication
      }

      return changed || hadDeadline
        ? {
            status: 'updated',
            playerId: parsedPlayerId,
            connected: true,
            ...(hadDeadline && { reconnectDeadline: 0 })
          }
        : { status: 'unchanged' }
    }

    if (
      this.connectedPlayers[parsedPlayerId] === false &&
      this.reconnectDeadlines[parsedPlayerId] !== undefined
    ) {
      return { status: 'unchanged' }
    }

    this.connectedPlayers[parsedPlayerId] = false
    const reconnectDeadline = observedAt + this.disconnectPolicy.gracePeriodMs
    this.reconnectDeadlines[parsedPlayerId] = reconnectDeadline
    await this.scheduleDisconnectAlarm()

    return {
      status: 'updated',
      playerId: parsedPlayerId,
      connected: false,
      reconnectDeadline
    }
  }

  adjudicateDisconnects(now = Date.now()): PresenceUpdateResult {
    if (this.disconnectPolicy === undefined || this.gameState === undefined) {
      return { status: 'disabled' }
    }

    const gameState = GameState.fromJson(gameStateSchema.parse(this.gameState))
    if (gameState.outcome !== 'ongoing') {
      this.reconnectDeadlines = {}
      return { status: 'unchanged' }
    }

    const players = [gameState.playerOne.id, gameState.playerTwo.id]
    const expiredPlayers = players.filter(
      (playerId) => (this.reconnectDeadlines[playerId] ?? Infinity) <= now
    )

    if (expiredPlayers.length === 2) {
      gameState.finishAsNoContest()
    } else if (expiredPlayers.length === 1) {
      const disconnectedPlayerId = expiredPlayers[0]
      const opponentId = players.find(
        (playerId) => playerId !== disconnectedPlayerId
      )!
      if (this.connectedPlayers[opponentId] !== true) {
        return { status: 'unchanged' }
      }
      gameState.finishByForfeit(disconnectedPlayerId)
    } else {
      return { status: 'unchanged' }
    }

    this.reconnectDeadlines = {}
    return {
      status: 'adjudicated',
      gameState: this.commitGameState(gameState)
    }
  }

  async alarm(): Promise<void> {
    await this.loadFromStorage()
    const result = this.adjudicateDisconnects()
    if (result.status === 'adjudicated') {
      this.pendingDisconnectBroadcast = result.gameState
    }
    await this.scheduleDisconnectAlarm()
    await this.persist()

    if (this.pendingDisconnectBroadcast !== undefined) {
      await this.broadcastAlarmResult(this.pendingDisconnectBroadcast)
      this.pendingDisconnectBroadcast = undefined
      await this.persist()
    }
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

  play(command: PlayGameCommand): IdempotentMutationResult<PlayGameResult> {
    const parsedCommand = playGameCommandSchema.parse(command)

    return this.runIdempotently(
      parsedCommand.mutationId,
      'play',
      {
        actorId: parsedCommand.actorId,
        column: parsedCommand.column,
        expectedRevision: parsedCommand.expectedRevision
      },
      playGameResultSchema,
      () => this.applyPlayIntent(parsedCommand)
    )
  }

  private applyPlayIntent(command: PlayGameCommand): PlayGameResult {
    const result = applyPlayCommand(this.gameState, command)
    if (result.status === 'rejected') {
      return result
    }

    return {
      status: 'updated',
      gameState: this.commitGameState(result.gameState)
    }
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

    if (
      playerId !== gameState.playerOne.id &&
      playerId !== gameState.playerTwo.id
    ) {
      return { status: 'unknown-player' }
    }

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

  private readPlayerGameState(playerId: string): GameState | undefined {
    if (this.gameState === undefined) {
      return
    }

    const gameState = GameState.fromJson(gameStateSchema.parse(this.gameState))
    if (
      gameState.playerOne.id !== playerId &&
      gameState.playerTwo.id !== playerId
    ) {
      return
    }

    return gameState
  }

  private async scheduleDisconnectAlarm(): Promise<void> {
    const deadlines = Object.values(this.reconnectDeadlines)
    if (deadlines.length === 0) {
      await this.deleteAlarm()
      return
    }

    await this.setAlarm(Math.min(...deadlines))
  }

  private async broadcastAlarmResult(gameState: IGameState): Promise<void> {
    const roomKey = this.disconnectPolicy?.roomKey
    if (roomKey === undefined) {
      return
    }

    const environment = (
      this.state as DurableObjectState & { env: CloudflareEnvironment }
    ).env
    const id = environment.WEB_SOCKET_DURABLE_OBJECT.idFromName(roomKey)
    const webSocketStore = environment.WEB_SOCKET_DURABLE_OBJECT.get(id)
    const requestId = crypto.randomUUID()
    const response = await webSocketStore.fetch('https://dummy-url/broadcast', {
      method: 'POST',
      headers: { 'X-Request-Id': requestId },
      body: JSON.stringify(toGameStateMessage(gameState, roomKey, requestId))
    })

    if (!response.ok) {
      throw new Error('The WebSocket room rejected a disconnect outcome.')
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
