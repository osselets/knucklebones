import { Toucan } from 'toucan-js'
import {
  DEFAULT_RATING_POOL,
  type MatchmakingPopulation,
  type MatchmakingStatus,
  matchmakingStatusSchema,
  matchIdSchema,
  playerIdSchema,
  requestIdSchema,
  RANKED_MATCH_FORMAT,
  RANKED_QUEUE_KEY,
  type RankedMatchAssignment,
  toGameErrorMessage
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { apiError } from '../utils/http'
import { recordOperationalEvent } from '../utils/observability'
import {
  countActiveRankedPlayers,
  expireRankedAssignment,
  getActiveRankedMatchForPlayer,
  releaseRankedMatch,
  reserveRankedMatch
} from '../utils/rankedMatches'

const MATCHMAKING_STATE_KEY = 'matchmaking-state'
const RATING_SELECTION_WINDOW_MS = 500
const PREFERRED_RATING_DIFFERENCE = 100
const DISTANT_OPPONENT_WAIT_MS = 3_000
const QUEUE_ENTRY_TTL_MS = 15_000
const MATCH_ASSIGNMENT_TTL_MS = 15_000
const POPULATION_CACHE_TTL_MS = 5_000

interface QueueEntry {
  playerId: string
  rating: number
  joinedAt: number
  lastSeenAt: number
}

interface MatchmakingState {
  waiting: QueueEntry[]
  assignments: Record<string, RankedMatchAssignment>
  assignmentEntries: Record<
    string,
    { playerOne: QueueEntry; playerTwo: QueueEntry }
  >
  assignmentPresence: Record<string, string[]>
}

export class MatchmakingDurableObject {
  state: DurableObjectState
  cloudflareEnvironment: CloudflareEnvironment
  sentry: Toucan
  activePlayerCountCache?: { value: number; expiresAt: number }

  constructor(
    state: DurableObjectState,
    cloudflareEnvironment: CloudflareEnvironment
  ) {
    this.state = state
    this.cloudflareEnvironment = cloudflareEnvironment
    this.sentry = new Toucan({
      dsn: this.cloudflareEnvironment.SENTRY_DSN,
      context: this.state
    })
  }

  async fetch(request: Request): Promise<Response> {
    const requestId = request.headers.get('X-Request-Id') ?? crypto.randomUUID()

    try {
      const url = new URL(request.url)
      const playerId = request.headers.get('X-Player-Id')

      const parsedPlayerId = playerIdSchema.safeParse(playerId)
      if (!parsedPlayerId.success) {
        return apiError({
          status: 400,
          code: 'INVALID_MATCHMAKING_REQUEST',
          message: 'The matchmaking request is invalid.',
          requestId
        })
      }

      switch (`${request.method} ${url.pathname}`) {
        case 'POST /join': {
          const ratingHeader = request.headers.get('X-Player-Rating')
          const rating = ratingHeader === null ? NaN : Number(ratingHeader)
          if (
            ratingHeader === null ||
            !/^-?\d+$/.test(ratingHeader) ||
            !Number.isSafeInteger(rating)
          ) {
            return apiError({
              status: 400,
              code: 'INVALID_PLAYER_RATING',
              message: 'The player rating is invalid.',
              requestId
            })
          }
          return await this.join(parsedPlayerId.data, rating)
        }
        case 'GET /status':
          return await this.getStatus(parsedPlayerId.data)
        case 'DELETE /queue':
          return await this.leave(parsedPlayerId.data)
        case 'POST /presence': {
          const matchId = matchIdSchema.safeParse(
            request.headers.get('X-Match-Id')
          )
          const connected = request.headers.get('X-Connected')
          if (
            !matchId.success ||
            !['true', 'false'].includes(connected ?? '')
          ) {
            return apiError({
              status: 400,
              code: 'INVALID_MATCHMAKING_PRESENCE',
              message: 'The matchmaking presence update is invalid.',
              requestId
            })
          }
          return await this.updateAssignmentPresence(
            parsedPlayerId.data,
            matchId.data,
            connected === 'true'
          )
        }
        default:
          return apiError({
            status: 404,
            code: 'NOT_FOUND',
            message: 'The requested resource was not found.',
            requestId
          })
      }
    } catch (error) {
      this.sentry.setTag('request_id', requestId)
      this.sentry.captureException(error)
      return apiError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. The team has been notified.',
        requestId,
        retryable: true
      })
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    const state = await this.getActiveState(now)
    await this.matchEligiblePlayers(state, now)
    await this.persistState(state, now)
  }

  private async join(playerId: string, rating: number): Promise<Response> {
    const now = Date.now()
    const state = await this.getActiveState(now)
    const assignment = state.assignments[playerId]

    if (assignment !== undefined) {
      await this.persistState(state, now)
      await this.configureRankedRoom(assignment)
      return this.statusResponse({ status: 'matched', match: assignment })
    }

    const existingEntry = state.waiting.find(
      (entry) => entry.playerId === playerId
    )

    if (existingEntry === undefined) {
      const activeMatch = await getActiveRankedMatchForPlayer(
        this.cloudflareEnvironment.PLAYERS_DB,
        playerId,
        now
      )
      if (activeMatch !== undefined) {
        await this.persistState(state, now)
        await this.configureRankedRoom(activeMatch.assignment)
        return this.statusResponse({
          status: 'matched',
          match: activeMatch.assignment
        })
      }
      state.waiting.push({ playerId, rating, joinedAt: now, lastSeenAt: now })
      recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
        event: 'matchmaking.queue',
        outcome: 'joined',
        queue_key: RANKED_QUEUE_KEY,
        queue_size: state.waiting.length
      })
    } else {
      existingEntry.rating = rating
      existingEntry.lastSeenAt = now
    }

    await this.matchEligiblePlayers(state, now)
    await this.persistState(state, now)

    return await this.getPlayerStatus(state, playerId, now)
  }

  private async getStatus(playerId: string): Promise<Response> {
    const now = Date.now()
    const state = await this.getActiveState(now)
    const assignment = state.assignments[playerId]
    if (assignment !== undefined) {
      await this.configureRankedRoom(assignment)
      await this.persistState(state, now)
      return this.statusResponse({ status: 'matched', match: assignment })
    }
    const entry = state.waiting.find(
      (candidate) => candidate.playerId === playerId
    )

    if (entry !== undefined) {
      entry.lastSeenAt = now
      await this.matchEligiblePlayers(state, now)
      await this.persistState(state, now)
      return await this.getPlayerStatus(state, playerId, now)
    }

    const activeMatch = await getActiveRankedMatchForPlayer(
      this.cloudflareEnvironment.PLAYERS_DB,
      playerId,
      now
    )
    if (activeMatch !== undefined) {
      await this.persistState(state, now)
      await this.configureRankedRoom(activeMatch.assignment)
      return this.statusResponse({
        status: 'matched',
        match: activeMatch.assignment
      })
    }

    await this.persistState(state, now)
    return this.statusResponse({ status: 'idle' })
  }

  private async leave(playerId: string): Promise<Response> {
    const now = Date.now()
    const state = await this.getActiveState(now)
    const previousQueueSize = state.waiting.length
    state.waiting = state.waiting.filter((entry) => entry.playerId !== playerId)
    recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
      event: 'matchmaking.queue',
      outcome:
        state.waiting.length < previousQueueSize ? 'cancelled' : 'not-found',
      queue_key: RANKED_QUEUE_KEY,
      queue_size: state.waiting.length
    })
    await this.matchEligiblePlayers(state, now)
    await this.persistState(state, now)
    return new Response(null, { status: 204 })
  }

  private async updateAssignmentPresence(
    playerId: string,
    matchId: string,
    connected: boolean
  ): Promise<Response> {
    const now = Date.now()
    const state = await this.loadState()
    const assignment = state.assignments[playerId]
    if (assignment?.matchId === matchId) {
      const connectedPlayerIds = new Set(
        state.assignmentPresence[matchId] ?? []
      )
      if (connected) {
        connectedPlayerIds.add(playerId)
      } else {
        connectedPlayerIds.delete(playerId)
      }
      state.assignmentPresence[matchId] = [...connectedPlayerIds]
    }
    await this.removeInactiveState(state, now, false)
    await this.persistState(state, now)
    return new Response(null, { status: 204 })
  }

  private async getActiveState(now: number): Promise<MatchmakingState> {
    const state = await this.loadState()
    await this.removeInactiveState(state, now, true)
    return state
  }

  private async loadState(): Promise<MatchmakingState> {
    const state = (await this.state.storage.get<MatchmakingState>(
      MATCHMAKING_STATE_KEY
    )) ?? {
      waiting: [],
      assignments: {},
      assignmentEntries: {},
      assignmentPresence: {}
    }
    state.assignmentEntries ??= {}
    state.assignmentPresence ??= {}
    return state
  }

  private async removeInactiveState(
    state: MatchmakingState,
    now: number,
    broadcastExpirations: boolean
  ): Promise<void> {
    const previousQueueSize = state.waiting.length
    state.waiting = state.waiting.filter(
      (entry) => entry.lastSeenAt > now - QUEUE_ENTRY_TTL_MS
    )
    const expiredQueueEntries = previousQueueSize - state.waiting.length
    if (expiredQueueEntries > 0) {
      recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
        event: 'matchmaking.queue',
        outcome: 'expired',
        queue_key: RANKED_QUEUE_KEY,
        expired_count: expiredQueueEntries,
        queue_size: state.waiting.length
      })
    }
    const expiredAssignments = new Map(
      Object.values(state.assignments)
        .filter((match) => match.expiresAt <= now)
        .map((match) => [match.matchId, match])
    )
    for (const match of expiredAssignments.values()) {
      const connectedPlayerIds = state.assignmentPresence[match.matchId] ?? []
      const expired = await expireRankedAssignment(
        this.cloudflareEnvironment.PLAYERS_DB,
        match.matchId,
        now
      )
      if (expired) {
        const entries = state.assignmentEntries[match.matchId]
        if (entries !== undefined) {
          for (const entry of [entries.playerOne, entries.playerTwo]) {
            if (
              connectedPlayerIds.includes(entry.playerId) &&
              !state.waiting.some(
                (waitingEntry) => waitingEntry.playerId === entry.playerId
              )
            ) {
              state.waiting.push({ ...entry, lastSeenAt: now })
            }
          }
        }
        if (broadcastExpirations && connectedPlayerIds.length > 0) {
          try {
            await this.broadcastAssignmentExpired(match)
          } catch (error) {
            this.sentry.captureException(error)
          }
        }
        recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
          event: 'matchmaking.assignment',
          outcome: 'expired',
          queue_key: match.queueKey,
          connected_players: connectedPlayerIds.length,
          requeued_players: state.waiting.filter((entry) =>
            connectedPlayerIds.includes(entry.playerId)
          ).length
        })
      }
      delete state.assignmentEntries[match.matchId]
      delete state.assignmentPresence[match.matchId]
    }
    state.assignments = Object.fromEntries(
      Object.entries(state.assignments).filter(
        ([, match]) => match.expiresAt > now
      )
    )
  }

  private async matchEligiblePlayers(
    state: MatchmakingState,
    now: number
  ): Promise<void> {
    while (true) {
      const entries = [...state.waiting].sort(
        (left, right) => left.joinedAt - right.joinedAt
      )
      const matchableEntry = entries.find(
        (entry) => this.getEligibleOpponent(state, entry, now) !== undefined
      )
      if (matchableEntry === undefined) {
        return
      }

      const opponent = this.getEligibleOpponent(state, matchableEntry, now)
      if (opponent === undefined) {
        return
      }
      await this.createMatch(state, matchableEntry, opponent, now)
    }
  }

  private getEligibleOpponent(
    state: MatchmakingState,
    entry: QueueEntry,
    now: number
  ): QueueEntry | undefined {
    if (now - entry.joinedAt < RATING_SELECTION_WINDOW_MS) {
      return
    }

    const opponents = state.waiting
      .filter((candidate) => candidate.playerId !== entry.playerId)
      .sort((left, right) => {
        const ratingDifference =
          Math.abs(left.rating - entry.rating) -
          Math.abs(right.rating - entry.rating)
        return ratingDifference || left.joinedAt - right.joinedAt
      })

    const preferredOpponent = opponents.find(
      (opponent) =>
        Math.abs(opponent.rating - entry.rating) <= PREFERRED_RATING_DIFFERENCE
    )
    if (preferredOpponent !== undefined) {
      return preferredOpponent
    }

    const firstDistantOpponentAt = opponents.reduce<number | undefined>(
      (oldest, opponent) =>
        oldest === undefined
          ? opponent.joinedAt
          : Math.min(oldest, opponent.joinedAt),
      undefined
    )
    if (
      firstDistantOpponentAt === undefined ||
      now - Math.max(entry.joinedAt, firstDistantOpponentAt) <
        DISTANT_OPPONENT_WAIT_MS
    ) {
      return
    }
    return opponents[0]
  }

  private async createMatch(
    state: MatchmakingState,
    entry: QueueEntry,
    opponent: QueueEntry,
    now: number
  ): Promise<void> {
    const match: RankedMatchAssignment = {
      matchId: crypto.randomUUID(),
      roomKey: crypto.randomUUID(),
      queueKey: RANKED_QUEUE_KEY,
      ratingPool: DEFAULT_RATING_POOL,
      format: RANKED_MATCH_FORMAT,
      playerOneId: entry.playerId,
      playerTwoId: opponent.playerId,
      playerOneRating: entry.rating,
      playerTwoRating: opponent.rating,
      createdAt: now,
      expiresAt: now + MATCH_ASSIGNMENT_TTL_MS
    }

    await reserveRankedMatch(this.cloudflareEnvironment.PLAYERS_DB, match)
    try {
      await this.configureRankedRoom(match)
    } catch (error) {
      await releaseRankedMatch(
        this.cloudflareEnvironment.PLAYERS_DB,
        match.matchId
      )
      throw error
    }

    state.waiting = state.waiting.filter(
      (candidate) =>
        candidate.playerId !== entry.playerId &&
        candidate.playerId !== opponent.playerId
    )
    state.assignments[entry.playerId] = match
    state.assignments[opponent.playerId] = match
    state.assignmentEntries[match.matchId] = {
      playerOne: entry,
      playerTwo: opponent
    }
    state.assignmentPresence[match.matchId] = []
    const ratingDifference = Math.abs(entry.rating - opponent.rating)
    recordOperationalEvent(this.cloudflareEnvironment.ENVIRONMENT, {
      event: 'matchmaking.assignment',
      outcome: 'created',
      queue_key: match.queueKey,
      wait_ms: Math.max(now - entry.joinedAt, now - opponent.joinedAt),
      rating_difference: ratingDifference,
      preferred: ratingDifference <= PREFERRED_RATING_DIFFERENCE,
      queue_size: state.waiting.length
    })
  }

  private async broadcastAssignmentExpired(
    assignment: RankedMatchAssignment
  ): Promise<void> {
    const requestId = requestIdSchema.parse(crypto.randomUUID())
    const id = this.cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.idFromName(
      assignment.roomKey
    )
    const room = this.cloudflareEnvironment.WEB_SOCKET_DURABLE_OBJECT.get(id)
    const response = await room.fetch('https://dummy-url/broadcast', {
      method: 'POST',
      headers: { 'X-Request-Id': requestId },
      body: JSON.stringify(
        toGameErrorMessage({
          code: 'RANKED_ASSIGNMENT_EXPIRED',
          message: 'The opponent did not connect. Returning to matchmaking.',
          requestId,
          retryable: true
        })
      )
    })
    if (!response.ok) {
      throw new Error('The WebSocket room rejected the assignment expiry.')
    }
  }

  private async persistState(
    state: MatchmakingState,
    now: number
  ): Promise<void> {
    await this.state.storage.put(MATCHMAKING_STATE_KEY, state)
    const nextAlarmAt = this.getNextAlarmAt(state, now)
    if (nextAlarmAt === undefined) {
      await this.state.storage.deleteAlarm()
    } else {
      await this.state.storage.setAlarm(nextAlarmAt)
    }
  }

  private getNextAlarmAt(
    state: MatchmakingState,
    now: number
  ): number | undefined {
    const deadlines = [
      ...state.waiting.map((entry) => entry.lastSeenAt + QUEUE_ENTRY_TTL_MS),
      ...Object.values(state.assignments).map((match) => match.expiresAt)
    ]

    for (const entry of state.waiting) {
      const opponents = state.waiting.filter(
        (candidate) => candidate.playerId !== entry.playerId
      )
      if (opponents.length === 0) {
        continue
      }

      const hasPreferredOpponent = opponents.some(
        (opponent) =>
          Math.abs(opponent.rating - entry.rating) <=
          PREFERRED_RATING_DIFFERENCE
      )
      if (hasPreferredOpponent) {
        deadlines.push(entry.joinedAt + RATING_SELECTION_WINDOW_MS)
      } else {
        const firstDistantOpponentAt = Math.min(
          ...opponents.map((opponent) => opponent.joinedAt)
        )
        deadlines.push(
          Math.max(
            entry.joinedAt + RATING_SELECTION_WINDOW_MS,
            Math.max(entry.joinedAt, firstDistantOpponentAt) +
              DISTANT_OPPONENT_WAIT_MS
          )
        )
      }
    }

    return deadlines
      .filter((deadline) => deadline > now)
      .sort((left, right) => left - right)[0]
  }

  private async configureRankedRoom(
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
          'do-content': JSON.stringify([assignment])
        }
      }
    )
    if (!response.ok) {
      throw new Error('The ranked game room rejected its assignment.')
    }
  }

  private async getPlayerStatus(
    state: MatchmakingState,
    playerId: string,
    now: number
  ): Promise<Response> {
    const match = state.assignments[playerId]
    if (match !== undefined) {
      return this.statusResponse({ status: 'matched', match })
    }

    const entry = state.waiting.find(
      (candidate) => candidate.playerId === playerId
    )
    if (entry !== undefined) {
      return this.statusResponse({
        status: 'waiting',
        joinedAt: entry.joinedAt,
        population: await this.getPopulation(state, now)
      })
    }

    return this.statusResponse({ status: 'idle' })
  }

  private async getPopulation(
    state: MatchmakingState,
    now: number
  ): Promise<MatchmakingPopulation> {
    if (
      this.activePlayerCountCache === undefined ||
      this.activePlayerCountCache.expiresAt <= now
    ) {
      this.activePlayerCountCache = {
        value: await countActiveRankedPlayers(
          this.cloudflareEnvironment.PLAYERS_DB,
          RANKED_QUEUE_KEY
        ),
        expiresAt: now + POPULATION_CACHE_TTL_MS
      }
    }

    return {
      queuedPlayers: state.waiting.length,
      activePlayers: this.activePlayerCountCache.value
    }
  }

  private statusResponse(status: MatchmakingStatus): Response {
    return Response.json(matchmakingStatusSchema.parse(status), {
      headers: { 'Cache-Control': 'no-store' }
    })
  }
}
