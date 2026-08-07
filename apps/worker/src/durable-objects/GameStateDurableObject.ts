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
  type RankedRematchStatus,
  type RankedMatchSettlement,
  type RankedMatchSettlementResult,
  RANKED_TIMEOUT_FORFEIT_COUNT,
  RANKED_TURN_DURATION_MS,
  rankedMatchAssignmentSchema,
  roomKeySchema,
  toGameReconnectDeadlineMessage,
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
  expireRankedAssignment,
  getActiveRankedMatchRow,
  releaseRankedMatch,
  reserveRankedMatch,
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
const DEFAULT_DISCONNECT_NOTIFICATION_DELAY_MS = 5_000
const RANKED_REMATCH_ASSIGNMENT_TTL_MS = 15_000
const RANKED_SETTLEMENT_RETRY_DELAY_MS = 15_000
const RANKED_SETTLEMENT_RETRY_ALERT_AFTER = 5

type RankedRematchRequestResult =
  | RankedRematchStatus
  | { status: 'game-ongoing' | 'not-ranked' | 'unknown-player' }
  | ({ status: 'waiting' } & { gameState: IGameState })

interface RatingRow {
  player_id: string
  rating: number
}

interface DisconnectPolicy {
  roomKey: string
  gracePeriodMs: number
  notificationDelayMs: number
}

type RankedTurnTimeoutResult =
  { status: 'unchanged' } | { status: 'adjudicated'; gameState: IGameState }

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
  pendingDisconnectNotifications: Record<string, number>
  pendingDisconnectBroadcast?: IGameState
  rankedMatch?: RankedMatchAssignment
  rankedRematch?: RankedMatchAssignment
  rankedSettlement?: RankedMatchSettlement
  rankedSettlementPending = false
  rankedRematchRoom = false
  rankedSettlementRetryCount = 0
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
    this.pendingDisconnectNotifications = {}
    this.rankedPlayerClaims = {}
    this.rankedSettlementPending = false
    this.rankedRematchRoom = false
    this.rankedSettlementRetryCount = 0
  }

  getPersistable(): Record<string, unknown> {
    const persistable = super.getPersistable() as Record<string, unknown>
    delete persistable.cloudflareEnvironment
    return persistable
  }

  async configureRankedMatch(
    assignment: RankedMatchAssignment,
    options?: { rematch?: boolean }
  ): Promise<void> {
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
    this.rankedRematchRoom = options?.rematch === true
    this.rankedPlayerClaims = {}
    this.configureDisconnectPolicy(parsedAssignment.roomKey)
    await this.scheduleGameAlarm()
  }

  configureDisconnectPolicy(
    roomKey: string,
    gracePeriodMs = DEFAULT_DISCONNECT_GRACE_MS,
    notificationDelayMs = DEFAULT_DISCONNECT_NOTIFICATION_DELAY_MS
  ): void {
    this.disconnectPolicy = {
      roomKey: roomKeySchema.parse(roomKey),
      gracePeriodMs: Number.isInteger(gracePeriodMs)
        ? Math.min(Math.max(gracePeriodMs, 1), 5 * 60_000)
        : DEFAULT_DISCONNECT_GRACE_MS,
      notificationDelayMs: Number.isInteger(notificationDelayMs)
        ? Math.max(notificationDelayMs, 0)
        : DEFAULT_DISCONNECT_NOTIFICATION_DELAY_MS
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
    if (gameState === undefined) {
      return { status: 'ignored' }
    }

    if (gameState.outcome !== 'ongoing') {
      const changed = this.connectedPlayers[parsedPlayerId] !== connected
      this.connectedPlayers[parsedPlayerId] = connected
      return changed
        ? { status: 'updated', playerId: parsedPlayerId, connected }
        : { status: 'unchanged' }
    }

    if (connected) {
      const hadDeadline = this.reconnectDeadlines[parsedPlayerId] !== undefined
      const notificationPending =
        this.pendingDisconnectNotifications[parsedPlayerId] !== undefined
      const changed = this.connectedPlayers[parsedPlayerId] !== true
      this.connectedPlayers[parsedPlayerId] = true
      delete this.reconnectDeadlines[parsedPlayerId]
      delete this.pendingDisconnectNotifications[parsedPlayerId]

      const adjudication = this.adjudicateDisconnects(observedAt)
      await this.scheduleGameAlarm()
      if (adjudication.status === 'adjudicated') {
        return adjudication
      }

      return changed || hadDeadline
        ? {
            status: 'updated',
            playerId: parsedPlayerId,
            connected: true,
            ...(hadDeadline && !notificationPending && { reconnectDeadline: 0 })
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
    // The reconnect deadline is only broadcast once the notification delay
    // elapses, so quick reconnects do not spam the opponent.
    this.pendingDisconnectNotifications[parsedPlayerId] =
      observedAt + this.disconnectPolicy.notificationDelayMs
    await this.scheduleGameAlarm()

    return {
      status: 'updated',
      playerId: parsedPlayerId,
      connected: false
    }
  }

  adjudicateDisconnects(now = Date.now()): PresenceUpdateResult {
    if (this.disconnectPolicy === undefined || this.gameState === undefined) {
      return { status: 'disabled' }
    }

    const gameState = GameState.fromJson(gameStateSchema.parse(this.gameState))
    if (gameState.outcome !== 'ongoing') {
      this.reconnectDeadlines = {}
      this.pendingDisconnectNotifications = {}
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
      gameState.finishByForfeit(disconnectedPlayerId, 'disconnect')
    } else {
      return { status: 'unchanged' }
    }

    gameState.rankedTurn = undefined
    this.reconnectDeadlines = {}
    this.pendingDisconnectNotifications = {}
    return {
      status: 'adjudicated',
      gameState: this.commitGameState(gameState)
    }
  }

  async alarm(): Promise<void> {
    await this.loadFromStorage()
    const now = Date.now()

    await this.releaseExpiredRematchAssignment(now)
    await this.settlePendingRankedResult()

    const pendingBroadcast = this.pendingDisconnectBroadcast
    if (pendingBroadcast === undefined) {
      const disconnectResult = this.adjudicateDisconnects(now)
      let adjudicatedGameState: IGameState | undefined
      if (disconnectResult.status === 'adjudicated') {
        adjudicatedGameState = disconnectResult.gameState
      } else {
        const turnResult = this.adjudicateRankedTurnTimeout(now)
        if (turnResult.status === 'adjudicated') {
          adjudicatedGameState = turnResult.gameState
        }
      }

      if (adjudicatedGameState !== undefined) {
        this.pendingDisconnectBroadcast = adjudicatedGameState
        if (adjudicatedGameState.outcome === 'game-ended') {
          await this.settlePendingRankedResult()
        }
        await this.persist()
      }
    }

    await this.broadcastDueDisconnectNotifications(now)

    await this.scheduleGameAlarm()
    await this.persist()

    const broadcast = this.pendingDisconnectBroadcast
    if (broadcast !== undefined) {
      await this.broadcastAlarmResult(broadcast)
      if (
        broadcast.finishReason === 'forfeit' &&
        broadcast.forfeitReason === 'timeout'
      ) {
        const timedOutPlayerId = [
          broadcast.playerOne.id,
          broadcast.playerTwo.id
        ].find((playerId) => playerId !== broadcast.winnerId)
        if (timedOutPlayerId !== undefined) {
          await this.disconnectRoomPlayer(timedOutPlayerId)
        }
      }
      this.pendingDisconnectBroadcast = undefined
      await this.persist()
    }

    if (this.rankedSettlementPending) {
      await this.scheduleGameAlarm()
      await this.persist()
    }
  }

  private async releaseExpiredRematchAssignment(now: number): Promise<void> {
    if (
      !this.rankedRematchRoom ||
      this.rankedMatch === undefined ||
      this.gameState !== undefined ||
      this.rankedMatch.expiresAt > now
    ) {
      return
    }

    const released = await expireRankedAssignment(
      this.cloudflareEnvironment.PLAYERS_DB,
      this.rankedMatch.matchId,
      now
    )
    if (released) {
      recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
        event: 'ranked.rematch',
        outcome: 'expired',
        queue_key: this.rankedMatch.queueKey
      })
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

    try {
      const result = await settleRankedMatchInDatabase(
        this.cloudflareEnvironment.PLAYERS_DB,
        this.rankedMatch,
        this.gameState
      )
      this.rankedSettlement = result.settlement
      this.rankedSettlementPending = false
      this.rankedSettlementRetryCount = 0
      recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
        event: 'ranked.settlement',
        outcome: result.status,
        queue_key: result.settlement.queueKey,
        result: result.settlement.result,
        finish_reason: result.settlement.finishReason,
        absolute_rating_change: Math.abs(result.settlement.playerOne.change)
      })
      return result
    } catch (error) {
      const activeRow = await getActiveRankedMatchRow(
        this.cloudflareEnvironment.PLAYERS_DB,
        this.rankedMatch.matchId
      )
      if (activeRow === undefined) {
        // The active row was already removed without a recorded settlement, so
        // there is nothing left to settle and the players are free to queue.
        this.rankedSettlementPending = false
        this.rankedSettlementRetryCount = 0
        return { status: 'not-finished' }
      }

      this.rankedSettlementPending = true
      this.rankedSettlementRetryCount += 1
      recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
        event: 'ranked.settlement.failed',
        queue_key: this.rankedMatch.queueKey,
        state: activeRow.state,
        attempts: this.rankedSettlementRetryCount,
        error: error instanceof Error ? error.message : String(error)
      })
      if (
        this.rankedSettlementRetryCount >= RANKED_SETTLEMENT_RETRY_ALERT_AFTER
      ) {
        recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
          event: 'ranked.settlement.stuck',
          queue_key: this.rankedMatch.queueKey,
          match_id: this.rankedMatch.matchId,
          attempts: this.rankedSettlementRetryCount
        })
      }
      await this.scheduleGameAlarm()
      await this.persist()
      // The match stays active so a later alarm retries the settlement.
      return { status: 'not-finished' }
    }
  }

  private async settlePendingRankedResult(): Promise<void> {
    if (this.rankedSettlementPending && this.rankedMatch !== undefined) {
      await this.settleRankedResult()
    }
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

    if (assignment.expiresAt <= Date.now()) {
      return { status: 'ranked-assignment-expired' }
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
    this.resetRankedTurn(gameState)
    this.rankedPlayerClaims = {}
    const serializedGameState = this.commitGameState(gameState)
    await this.scheduleGameAlarm()
    return { status: 'created', gameState: serializedGameState }
  }

  async play(
    command: PlayGameCommand
  ): Promise<IdempotentMutationResult<PlayGameResult>> {
    const parsedCommand = playGameCommandSchema.parse(command)

    return await this.runIdempotentlyAsync(
      parsedCommand.mutationId,
      'play',
      {
        actorId: parsedCommand.actorId,
        column: parsedCommand.column,
        expectedRevision: parsedCommand.expectedRevision
      },
      playGameResultSchema,
      async () => await this.applyPlayIntent(parsedCommand)
    )
  }

  private async applyPlayIntent(
    command: PlayGameCommand
  ): Promise<PlayGameResult> {
    const result = applyPlayCommand(this.gameState, command)
    if (result.status === 'rejected') {
      return result
    }

    this.resetRankedTurn(result.gameState)
    const gameState = this.commitGameState(result.gameState)
    await this.scheduleGameAlarm()
    return {
      status: 'updated',
      gameState
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

  async requestRankedRematch(
    playerId: string
  ): Promise<RankedRematchRequestResult> {
    const gameState = this.getInitializedGameState()
    const validation = this.validateRankedRematch(gameState, playerId)
    if (validation !== undefined) {
      return validation
    }
    if (this.rankedRematch !== undefined) {
      return { status: 'matched', match: this.rankedRematch }
    }

    const opponentId =
      playerId === gameState.playerOne.id
        ? gameState.playerTwo.id
        : gameState.playerOne.id
    if (this.connectedPlayers[opponentId] !== true) {
      return { status: 'opponent-unavailable' }
    }

    if (gameState.rematchVote === undefined) {
      gameState.rematchVote = playerId
      return {
        status: 'waiting',
        gameState: this.commitGameState(gameState)
      }
    }
    if (gameState.rematchVote === playerId) {
      return { status: 'waiting' }
    }

    this.rankedRematch = await this.createRankedRematch(gameState)
    return { status: 'matched', match: this.rankedRematch }
  }

  getRankedRematchStatus(playerId: string): RankedRematchRequestResult {
    const gameState = this.getInitializedGameState()
    const validation = this.validateRankedRematch(gameState, playerId)
    if (validation !== undefined) {
      return validation
    }
    if (this.rankedRematch !== undefined) {
      return { status: 'matched', match: this.rankedRematch }
    }

    const opponentId =
      playerId === gameState.playerOne.id
        ? gameState.playerTwo.id
        : gameState.playerOne.id
    return {
      status:
        this.connectedPlayers[opponentId] === true
          ? 'waiting'
          : 'opponent-unavailable'
    }
  }

  private validateRankedRematch(
    gameState: GameState,
    playerId: string
  ):
    | {
        status:
          | 'game-ongoing'
          | 'not-ranked'
          | 'unknown-player'
          | 'opponent-unavailable'
      }
    | undefined {
    if (
      playerId !== gameState.playerOne.id &&
      playerId !== gameState.playerTwo.id
    ) {
      return { status: 'unknown-player' }
    }
    if (this.rankedMatch === undefined) {
      return { status: 'not-ranked' }
    }
    if (gameState.outcome === 'ongoing') {
      return { status: 'game-ongoing' }
    }
    if (
      gameState.finishReason === 'forfeit' &&
      gameState.forfeitReason === 'timeout'
    ) {
      return { status: 'opponent-unavailable' }
    }
  }

  private async createRankedRematch(
    gameState: GameState
  ): Promise<RankedMatchAssignment> {
    const previousMatch = this.rankedMatch
    if (previousMatch === undefined) {
      throw new Error('The ranked rematch has no previous assignment.')
    }
    const players = [gameState.playerOne.id, gameState.playerTwo.id]
    const ratings = await this.cloudflareEnvironment.PLAYERS_DB.prepare(
      `SELECT player_id, rating
       FROM player_ratings
       WHERE rating_pool = ? AND player_id IN (?, ?)`
    )
      .bind(previousMatch.ratingPool, ...players)
      .all<RatingRow>()
    const ratingByPlayerId = new Map(
      ratings.results.map((row) => [row.player_id, row.rating])
    )
    const playerOneRating = ratingByPlayerId.get(gameState.playerOne.id)
    const playerTwoRating = ratingByPlayerId.get(gameState.playerTwo.id)
    if (
      !Number.isSafeInteger(playerOneRating) ||
      !Number.isSafeInteger(playerTwoRating)
    ) {
      throw new Error('The ranked rematch ratings are invalid.')
    }

    const createdAt = Date.now()
    const assignment: RankedMatchAssignment = {
      matchId: crypto.randomUUID(),
      roomKey: crypto.randomUUID(),
      queueKey: previousMatch.queueKey,
      ratingPool: previousMatch.ratingPool,
      format: previousMatch.format,
      playerOneId: gameState.playerOne.id,
      playerTwoId: gameState.playerTwo.id,
      playerOneRating: playerOneRating!,
      playerTwoRating: playerTwoRating!,
      createdAt,
      expiresAt: createdAt + RANKED_REMATCH_ASSIGNMENT_TTL_MS
    }

    await reserveRankedMatch(this.cloudflareEnvironment.PLAYERS_DB, assignment)
    try {
      await this.configureRankedRematchRoom(assignment)
    } catch (error) {
      await releaseRankedMatch(
        this.cloudflareEnvironment.PLAYERS_DB,
        assignment.matchId
      )
      throw error
    }
    return assignment
  }

  private async configureRankedRematchRoom(
    assignment: RankedMatchAssignment
  ): Promise<void> {
    const id = this.cloudflareEnvironment.GAME_STATE_DURABLE_OBJECT.idFromName(
      assignment.roomKey
    )
    const room = this.cloudflareEnvironment.GAME_STATE_DURABLE_OBJECT.get(id)
    const response = await room.fetch(
      'https://itty-durable/do/call/configureRankedMatch',
      {
        headers: {
          'do-name': assignment.roomKey,
          'do-content': JSON.stringify([assignment, { rematch: true }])
        }
      }
    )
    if (!response.ok) {
      throw new Error('The ranked rematch room rejected its assignment.')
    }
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

    gameState.finishByForfeit(playerId, 'resignation')
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

  adjudicateRankedTurnTimeout(
    now = Date.now(),
    randomValue = Math.random()
  ): RankedTurnTimeoutResult {
    if (this.rankedMatch === undefined || this.gameState === undefined) {
      return { status: 'unchanged' }
    }

    const gameState = GameState.fromJson(gameStateSchema.parse(this.gameState))
    const rankedTurn = gameState.rankedTurn
    if (
      gameState.outcome !== 'ongoing' ||
      rankedTurn === undefined ||
      rankedTurn.expiresAt > now
    ) {
      return { status: 'unchanged' }
    }

    const timedOutPlayer = gameState.nextPlayer
    const isPlayerOne = timedOutPlayer.id === gameState.playerOne.id
    const timeoutCount =
      (isPlayerOne
        ? rankedTurn.playerOneTimeouts
        : rankedTurn.playerTwoTimeouts) + 1

    gameState.rankedTurn = {
      ...rankedTurn,
      ...(isPlayerOne
        ? { playerOneTimeouts: timeoutCount }
        : { playerTwoTimeouts: timeoutCount })
    }

    if (timeoutCount >= RANKED_TIMEOUT_FORFEIT_COUNT) {
      gameState.finishByForfeit(timedOutPlayer.id, 'timeout')
      gameState.rankedTurn = undefined
    } else {
      const playableColumns = timedOutPlayer.columns.flatMap((column, index) =>
        column.length < 3 ? [index] : []
      )
      if (playableColumns.length === 0) {
        // A timed-out player with no legal move cannot keep playing, so the
        // game ends in a timeout forfeit instead of hanging the alarm.
        gameState.finishByForfeit(timedOutPlayer.id, 'timeout')
        gameState.rankedTurn = undefined
        recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
          event: 'ranked.turn',
          outcome: 'no-legal-move-forfeit',
          queue_key: this.rankedMatch.queueKey
        })
        return this.adjudicatedTimeoutResult(gameState)
      }
      const boundedRandomValue = Math.min(Math.max(randomValue, 0), 1)
      const randomIndex = Math.min(
        Math.floor(boundedRandomValue * playableColumns.length),
        playableColumns.length - 1
      )
      const rejectionReason = gameState.applyPlayIntent(
        timedOutPlayer.id,
        playableColumns[randomIndex]
      )
      if (rejectionReason !== undefined) {
        // The automatic move cannot be applied, so the timed-out player is
        // forfeited instead of leaving the game frozen on a rejected move.
        gameState.finishByForfeit(timedOutPlayer.id, 'timeout')
        gameState.rankedTurn = undefined
        recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
          event: 'ranked.turn',
          outcome: 'auto-move-rejected-forfeit',
          queue_key: this.rankedMatch.queueKey,
          reason: rejectionReason
        })
        return this.adjudicatedTimeoutResult(gameState)
      }
      this.resetRankedTurn(gameState, now)
    }

    return this.adjudicatedTimeoutResult(gameState)
  }

  private adjudicatedTimeoutResult(gameState: GameState): {
    status: 'adjudicated'
    gameState: IGameState
  } {
    return {
      status: 'adjudicated',
      gameState: this.commitGameState(gameState)
    }
  }

  private resetRankedTurn(gameState: GameState, now = Date.now()): void {
    if (this.rankedMatch === undefined || gameState.outcome !== 'ongoing') {
      gameState.rankedTurn = undefined
      return
    }

    gameState.rankedTurn = {
      expiresAt: now + RANKED_TURN_DURATION_MS,
      playerOneTimeouts: gameState.rankedTurn?.playerOneTimeouts ?? 0,
      playerTwoTimeouts: gameState.rankedTurn?.playerTwoTimeouts ?? 0
    }
  }

  private async broadcastDueDisconnectNotifications(
    now: number
  ): Promise<void> {
    if (this.disconnectPolicy === undefined || this.gameState === undefined) {
      return
    }
    if (this.gameState.outcome !== 'ongoing') {
      this.pendingDisconnectNotifications = {}
      return
    }

    for (const [playerId, notifyAt] of Object.entries(
      this.pendingDisconnectNotifications
    )) {
      if (notifyAt > now) {
        continue
      }
      const reconnectDeadline = this.reconnectDeadlines[playerId]
      if (
        this.connectedPlayers[playerId] !== true &&
        reconnectDeadline !== undefined
      ) {
        await this.broadcastReconnectDeadline(playerId, reconnectDeadline)
      }
      delete this.pendingDisconnectNotifications[playerId]
    }
  }

  private async broadcastReconnectDeadline(
    playerId: string,
    reconnectDeadline: number
  ): Promise<void> {
    const roomKey = this.disconnectPolicy?.roomKey
    if (roomKey === undefined) {
      return
    }

    const id =
      this.cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.idFromName(roomKey)
    const webSocketStore =
      this.cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.get(id)
    const requestId = crypto.randomUUID()
    const response = await webSocketStore.fetch('https://dummy-url/broadcast', {
      method: 'POST',
      headers: { 'X-Request-Id': requestId },
      body: JSON.stringify(
        toGameReconnectDeadlineMessage(
          roomKey,
          playerId,
          reconnectDeadline,
          requestId
        )
      )
    })

    if (!response.ok) {
      throw new Error('The WebSocket room rejected a reconnect deadline.')
    }
  }

  private async scheduleGameAlarm(): Promise<void> {
    const now = Date.now()
    const deadlines = Object.values(this.reconnectDeadlines)
    deadlines.push(...Object.values(this.pendingDisconnectNotifications))
    const rankedTurnDeadline = this.gameState?.rankedTurn?.expiresAt
    if (rankedTurnDeadline !== undefined) {
      deadlines.push(rankedTurnDeadline)
    }
    if (
      this.rankedRematchRoom &&
      this.rankedMatch !== undefined &&
      this.gameState === undefined
    ) {
      deadlines.push(this.rankedMatch.expiresAt)
    }
    if (this.rankedSettlementPending) {
      deadlines.push(now + RANKED_SETTLEMENT_RETRY_DELAY_MS)
    }
    const futureDeadlines = deadlines.filter((deadline) => deadline > now)
    if (futureDeadlines.length === 0) {
      await this.deleteAlarm()
      return
    }

    await this.setAlarm(Math.min(...futureDeadlines))
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

  private async disconnectRoomPlayer(playerId: string): Promise<void> {
    const roomKey = this.disconnectPolicy?.roomKey
    if (roomKey === undefined) {
      return
    }

    const environment = (
      this.state as DurableObjectState & { env: CloudflareEnvironment }
    ).env
    const id = environment.WEB_SOCKET_DURABLE_OBJECT.idFromName(roomKey)
    const webSocketStore = environment.WEB_SOCKET_DURABLE_OBJECT.get(id)
    const response = await webSocketStore.fetch(
      'https://dummy-url/disconnect-player',
      {
        method: 'POST',
        headers: { 'X-Player-Id': playerId }
      }
    )

    if (!response.ok) {
      throw new Error('The WebSocket room rejected a player disconnect.')
    }
  }

  private commitGameState(gameState: GameState): IGameState {
    gameState.revision = (this.gameState?.revision ?? 0) + 1
    const serializedGameState = gameState.toJson()
    if (
      this.rankedMatch !== undefined &&
      this.rankedSettlement === undefined &&
      serializedGameState.outcome === 'game-ended'
    ) {
      this.rankedSettlementPending = true
    }
    this.gameState = serializedGameState
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
