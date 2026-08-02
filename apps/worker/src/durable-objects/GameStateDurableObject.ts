import { createDurable } from 'itty-durable'
import {
  type GameSettings,
  GameState,
  gameStateSchema,
  type IGameState,
  type ILobby,
  type IPlayer,
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
  type ResignGameCommand,
  type ResignGameResult,
  resignGameCommandSchema,
  resignGameResultSchema,
  type RankedMatchAssignment,
  type RankedMatchSettlement,
  type RankedMatchSettlementResult,
  rankedMatchAssignmentSchema,
  roomKeySchema,
  toGameStateMessage,
  type UpdateDisplayNameResult,
  updateDisplayNameCommandSchema,
  updateDisplayNameResultSchema
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type IttyDurableObjectNamespace } from '../types/itty'
import { applyPlayCommand } from '../utils/authoritativeGame'
import { recordOperationalEvent } from '../utils/observability'
import {
  activateRankedMatch,
  settleRankedMatch as settleRankedMatchInDatabase
} from '../utils/rankedMatches'

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
  cloudflareEnvironment: CloudflareEnvironment
  lobby: ILobby
  gameState?: IGameState
  processedMutations: ProcessedMutations
  disconnectPolicy?: DisconnectPolicy
  connectedPlayers: Record<string, boolean>
  reconnectDeadlines: Record<string, number>
  pendingDisconnectBroadcast?: IGameState
  rankedMatch?: RankedMatchAssignment
  rankedSettlement?: RankedMatchSettlement
  rankedPlayerClaims: Record<string, IPlayer>

  constructor(
    state: DurableObjectState,
    cloudflareEnvironment: CloudflareEnvironment
  ) {
    super(state, cloudflareEnvironment)
    this.cloudflareEnvironment = cloudflareEnvironment
    this.lobby = new Lobby().toJson()
    this.processedMutations = {}
    this.connectedPlayers = {}
    this.reconnectDeadlines = {}
    this.rankedPlayerClaims = {}
  }

  getPersistable(): Record<string, unknown> {
    const persistable = super.getPersistable() as Record<string, unknown>
    delete persistable.cloudflareEnvironment
    return persistable
  }

  configureRankedMatch(assignment: RankedMatchAssignment): void {
    const parsedAssignment = rankedMatchAssignmentSchema.parse(assignment)
    if (this.rankedMatch !== undefined) {
      if (
        JSON.stringify(this.rankedMatch) === JSON.stringify(parsedAssignment)
      ) {
        return
      }
      throw new Error('The ranked room already has another assignment.')
    }

    if (this.gameState !== undefined || this.lobby.players.length > 0) {
      throw new Error('The ranked room was already initialized.')
    }

    this.rankedMatch = parsedAssignment
    this.rankedPlayerClaims = {}
    this.configureDisconnectPolicy(parsedAssignment.roomKey)
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

    if (this.gameState === undefined && this.rankedMatch !== undefined) {
      const isAssignedPlayer =
        parsedPlayerId === this.rankedMatch.playerOneId ||
        parsedPlayerId === this.rankedMatch.playerTwoId
      if (!isAssignedPlayer) {
        return { status: 'ignored' }
      }

      const changed = this.connectedPlayers[parsedPlayerId] !== connected
      this.connectedPlayers[parsedPlayerId] = connected
      await this.reportRankedAssignmentPresence(parsedPlayerId, connected)
      return changed
        ? {
            status: 'updated',
            playerId: parsedPlayerId,
            connected
          }
        : { status: 'unchanged' }
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
      await this.settleRankedResult()
      await this.persist()
      await this.broadcastAlarmResult(this.pendingDisconnectBroadcast)
      this.pendingDisconnectBroadcast = undefined
      await this.persist()
    }
  }

  async initializeGame({
    mutationId,
    playerId,
    displayName,
    difficulty,
    boType
  }: InitializeGameCommand): Promise<
    IdempotentMutationResult<InitializeGameResult>
  > {
    const command = initializeGameCommandSchema.parse({
      mutationId,
      playerId,
      displayName,
      difficulty,
      boType
    })

    return await this.runIdempotentlyAsync(
      command.mutationId,
      'initialize-game',
      {
        playerId: command.playerId,
        displayName: command.displayName,
        difficulty: command.difficulty,
        boType: command.boType
      },
      initializeGameResultSchema,
      async () =>
        await this.applyInitializeGame({
          playerId: command.playerId,
          displayName: command.displayName,
          difficulty: command.difficulty,
          boType: command.boType
        })
    )
  }

  async settleRankedResult(): Promise<RankedMatchSettlementResult> {
    if (this.rankedMatch === undefined) {
      return { status: 'not-ranked' }
    }
    if (
      this.gameState === undefined ||
      this.gameState.outcome !== 'game-ended'
    ) {
      return { status: 'not-finished' }
    }

    const result = await settleRankedMatchInDatabase(
      this.cloudflareEnvironment.PLAYERS_DB,
      this.rankedMatch,
      this.gameState
    )
    this.rankedSettlement = result.settlement
    recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
      event: 'ranked.settlement',
      outcome: result.status,
      queue_key: result.settlement.queueKey,
      result: result.settlement.result,
      finish_reason: result.settlement.finishReason,
      absolute_rating_change: Math.abs(result.settlement.playerOne.change)
    })
    return result
  }

  private async applyInitializeGame({
    playerId,
    displayName,
    difficulty,
    boType
  }: Omit<InitializeGameCommand, 'mutationId'>): Promise<InitializeGameResult> {
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

    if (this.rankedMatch !== undefined) {
      return await this.applyRankedInitializeGame({
        playerId,
        displayName,
        difficulty,
        boType
      })
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

  private async applyRankedInitializeGame({
    playerId,
    displayName,
    difficulty,
    boType
  }: Omit<InitializeGameCommand, 'mutationId'>): Promise<InitializeGameResult> {
    const assignment = this.rankedMatch!
    if (
      playerId !== assignment.playerOneId &&
      playerId !== assignment.playerTwoId
    ) {
      return { status: 'not-assigned' }
    }

    if (difficulty !== undefined || (boType !== undefined && boType !== 1)) {
      return { status: 'invalid-ranked-settings' }
    }

    this.rankedPlayerClaims[playerId] = new Player(
      playerId,
      displayName
    ).toJson()
    const playerOne = this.rankedPlayerClaims[assignment.playerOneId]
    const playerTwo = this.rankedPlayerClaims[assignment.playerTwoId]
    if (playerOne === undefined || playerTwo === undefined) {
      return { status: 'waiting' }
    }

    const activationStatus = await activateRankedMatch(
      this.cloudflareEnvironment.PLAYERS_DB,
      assignment
    )
    if (activationStatus === 'expired') {
      this.rankedPlayerClaims = {}
      return { status: 'ranked-assignment-expired' }
    }

    const gameState = new GameState({
      playerOne: Player.fromJson(playerOne),
      playerTwo: Player.fromJson(playerTwo),
      boType: 1
    })
    gameState.initialize()
    this.rankedPlayerClaims = {}
    return { status: 'created', gameState: this.commitGameState(gameState) }
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

    if (this.rankedMatch !== undefined) {
      return { status: 'ranked-rematch-disabled' }
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

  resign(
    command: ResignGameCommand
  ): IdempotentMutationResult<ResignGameResult> {
    const parsedCommand = resignGameCommandSchema.parse(command)

    return this.runIdempotently(
      parsedCommand.mutationId,
      'resign',
      { playerId: parsedCommand.playerId },
      resignGameResultSchema,
      () => this.applyResign(parsedCommand.playerId)
    )
  }

  private applyResign(playerId: string): ResignGameResult {
    if (this.gameState === undefined) {
      return { status: 'game-not-initialized' }
    }

    const gameState = GameState.fromJson(gameStateSchema.parse(this.gameState))
    if (gameState.outcome !== 'ongoing') {
      return { status: 'game-ended' }
    }
    if (
      playerId !== gameState.playerOne.id &&
      playerId !== gameState.playerTwo.id
    ) {
      return { status: 'unknown-player' }
    }
    if (this.rankedMatch === undefined) {
      return { status: 'not-ranked' }
    }

    gameState.finishByForfeit(playerId)
    this.reconnectDeadlines = {}
    return { status: 'updated', gameState: this.commitGameState(gameState) }
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

  private async reportRankedAssignmentPresence(
    playerId: string,
    connected: boolean
  ): Promise<void> {
    const assignment = this.rankedMatch
    if (assignment === undefined) {
      return
    }

    const id = this.cloudflareEnvironment.MATCHMAKING_DURABLE_OBJECT.idFromName(
      assignment.queueKey
    )
    const matchmaking =
      this.cloudflareEnvironment.MATCHMAKING_DURABLE_OBJECT.get(id)
    const response = await matchmaking.fetch('https://dummy-url/presence', {
      method: 'POST',
      headers: {
        'X-Player-Id': playerId,
        'X-Match-Id': assignment.matchId,
        'X-Connected': String(connected)
      }
    })
    if (!response.ok) {
      throw new Error('The matchmaker rejected a ranked presence update.')
    }
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

  private async runIdempotentlyAsync<T>(
    mutationId: string,
    operation: string,
    payload: unknown,
    resultSchema: { parse(value: unknown): T },
    mutation: () => Promise<T>
  ): Promise<IdempotentMutationResult<T>> {
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

    const value = await mutation()
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
