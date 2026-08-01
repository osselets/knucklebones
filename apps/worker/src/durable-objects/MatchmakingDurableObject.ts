import { Toucan } from 'toucan-js'
import {
  DEFAULT_RATING_POOL,
  type MatchmakingStatus,
  RANKED_MATCH_FORMAT,
  type RankedMatchAssignment
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { apiError } from '../utils/http'

const MATCHMAKING_STATE_KEY = 'matchmaking-state'
const RATING_SELECTION_WINDOW_MS = 750
const QUEUE_ENTRY_TTL_MS = 15_000
const MATCH_ASSIGNMENT_TTL_MS = 5 * 60 * 1000

interface QueueEntry {
  playerId: string
  rating: number
  joinedAt: number
  lastSeenAt: number
}

interface MatchmakingState {
  waiting: QueueEntry[]
  assignments: Record<string, RankedMatchAssignment>
}

export class MatchmakingDurableObject {
  state: DurableObjectState
  cloudflareEnvironment: CloudflareEnvironment
  sentry: Toucan

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

      if (playerId === null) {
        return apiError({
          status: 400,
          code: 'INVALID_MATCHMAKING_REQUEST',
          message: 'The matchmaking request is invalid.',
          requestId
        })
      }

      switch (`${request.method} ${url.pathname}`) {
        case 'POST /join': {
          const rating = Number(request.headers.get('X-Player-Rating'))
          if (!Number.isInteger(rating)) {
            return apiError({
              status: 400,
              code: 'INVALID_PLAYER_RATING',
              message: 'The player rating is invalid.',
              requestId
            })
          }
          return await this.join(playerId, rating)
        }
        case 'GET /status':
          return await this.getStatus(playerId)
        case 'DELETE /queue':
          return await this.leave(playerId)
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

  private async join(playerId: string, rating: number): Promise<Response> {
    const now = Date.now()
    const state = await this.getActiveState(now)
    const assignment = state.assignments[playerId]

    if (assignment !== undefined) {
      return this.statusResponse({ status: 'matched', match: assignment })
    }

    const existingEntry = state.waiting.find(
      (entry) => entry.playerId === playerId
    )

    if (existingEntry === undefined) {
      state.waiting.push({ playerId, rating, joinedAt: now, lastSeenAt: now })
    } else {
      existingEntry.rating = rating
      existingEntry.lastSeenAt = now
    }

    this.matchOldestEligiblePlayer(state, now)
    await this.state.storage.put(MATCHMAKING_STATE_KEY, state)

    return this.getPlayerStatus(state, playerId)
  }

  private async getStatus(playerId: string): Promise<Response> {
    const now = Date.now()
    const state = await this.getActiveState(now)
    const entry = state.waiting.find(
      (candidate) => candidate.playerId === playerId
    )

    if (entry !== undefined) {
      entry.lastSeenAt = now
      this.matchPlayerIfEligible(state, entry, now)
    }

    await this.state.storage.put(MATCHMAKING_STATE_KEY, state)
    return this.getPlayerStatus(state, playerId)
  }

  private async leave(playerId: string): Promise<Response> {
    const state = await this.getActiveState(Date.now())
    state.waiting = state.waiting.filter((entry) => entry.playerId !== playerId)
    await this.state.storage.put(MATCHMAKING_STATE_KEY, state)
    return new Response(null, { status: 204 })
  }

  private async getActiveState(now: number): Promise<MatchmakingState> {
    const state = (await this.state.storage.get<MatchmakingState>(
      MATCHMAKING_STATE_KEY
    )) ?? { waiting: [], assignments: {} }

    state.waiting = state.waiting.filter(
      (entry) => entry.lastSeenAt > now - QUEUE_ENTRY_TTL_MS
    )
    state.assignments = Object.fromEntries(
      Object.entries(state.assignments).filter(
        ([, match]) => match.createdAt > now - MATCH_ASSIGNMENT_TTL_MS
      )
    )
    return state
  }

  private matchOldestEligiblePlayer(state: MatchmakingState, now: number) {
    const entry = [...state.waiting]
      .sort((left, right) => left.joinedAt - right.joinedAt)
      .find(
        (candidate) => now - candidate.joinedAt >= RATING_SELECTION_WINDOW_MS
      )

    if (entry !== undefined) {
      this.matchPlayerIfEligible(state, entry, now)
    }
  }

  private matchPlayerIfEligible(
    state: MatchmakingState,
    entry: QueueEntry,
    now: number
  ) {
    if (now - entry.joinedAt < RATING_SELECTION_WINDOW_MS) {
      return
    }

    const opponent = state.waiting
      .filter((candidate) => candidate.playerId !== entry.playerId)
      .sort((left, right) => {
        const ratingDifference =
          Math.abs(left.rating - entry.rating) -
          Math.abs(right.rating - entry.rating)
        return ratingDifference || left.joinedAt - right.joinedAt
      })[0]

    if (opponent === undefined) {
      return
    }

    const match: RankedMatchAssignment = {
      matchId: crypto.randomUUID(),
      roomKey: crypto.randomUUID(),
      ratingPool: DEFAULT_RATING_POOL,
      format: RANKED_MATCH_FORMAT,
      playerOneId: entry.playerId,
      playerTwoId: opponent.playerId,
      createdAt: now
    }

    state.waiting = state.waiting.filter(
      (candidate) =>
        candidate.playerId !== entry.playerId &&
        candidate.playerId !== opponent.playerId
    )
    state.assignments[entry.playerId] = match
    state.assignments[opponent.playerId] = match
  }

  private getPlayerStatus(state: MatchmakingState, playerId: string): Response {
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
        joinedAt: entry.joinedAt
      })
    }

    return this.statusResponse({ status: 'idle' })
  }

  private statusResponse(status: MatchmakingStatus): Response {
    return Response.json(status, {
      headers: { 'Cache-Control': 'no-store' }
    })
  }
}
