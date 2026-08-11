import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GameState,
  Player,
  toGameStateMessage,
  toGamePresenceMessage,
  toGameReconnectDeadlineMessage,
  type IGameState,
  type PlayerCredentials
} from '@knucklebones/common'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  ApiRequestError,
  createWebSocketTicket,
  initGame,
  play,
  reportClientProtocolDiagnostic
} from '../../utils/api'
import { ensurePlayerIdentity } from '../../utils/playerIdentity'
import type { GameSetup } from './GameContext'
import { useGameSetup } from './useGameSetup'

function readyState(
  current: GameSetup
): Exclude<GameSetup, null | { status: 'identity-error' }> | undefined {
  if (current === null || current.status === 'identity-error') {
    return undefined
  }
  return current
}

interface CapturedWebSocketOptions {
  shouldReconnect?(): boolean
  retryOnError?: boolean
  reconnectInterval?(attempt: number): number
}

const socket = vi.hoisted(() => ({
  lastJsonMessage: null as unknown,
  readyState: 0
}))
const navigate = vi.hoisted(() => vi.fn())
const useWebSocketCalls = vi.hoisted(
  () => [] as Array<[unknown, CapturedWebSocketOptions | undefined]>
)
const useWebSocketMock = vi.hoisted(() =>
  vi.fn((url: unknown, options?: CapturedWebSocketOptions) => {
    useWebSocketCalls.push([url, options])
    return socket
  })
)

vi.mock('react-use-websocket', () => ({
  default: useWebSocketMock,
  ReadyState: { CLOSED: 3, OPEN: 1 }
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate
}))
vi.mock('../../hooks/useRoomKey', () => ({
  useRoomKey: () => '11111111-1111-4111-8111-111111111111'
}))
vi.mock('../../utils/api', () => ({
  ApiRequestError: class extends Error {
    status: number
    code?: string

    constructor(status: number, message: string, code?: string) {
      super(message)
      this.status = status
      this.code = code
    }
  },
  createWebSocketTicket: vi.fn(),
  initGame: vi.fn(),
  play: vi.fn(),
  reportClientProtocolDiagnostic: vi.fn(),
  voteRematch: vi.fn()
}))
vi.mock('../../utils/playerIdentity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/playerIdentity')>()),
  ensurePlayerIdentity: vi.fn()
}))

const playerId = '22222222-2222-4222-8222-222222222222'
const roomKey = '11111111-1111-4111-8111-111111111111'
const foreignRoomKey = '33333333-3333-4333-8333-333333333333'

function wrapper({ children }: React.PropsWithChildren) {
  return <MemoryRouter>{children}</MemoryRouter>
}

function createGameState(
  revision: number,
  displayName = 'Current Name'
): IGameState {
  const playerOne = new Player(playerId, displayName, undefined, 4)
  const playerTwo = new Player('player-two', 'Player Two')

  return new GameState({
    revision,
    playerOne,
    playerTwo,
    nextPlayer: playerOne,
    outcome: 'ongoing',
    boType: 1
  }).toJson()
}

function emitMessage(message: unknown, rerender: () => void) {
  act(() => {
    socket.lastJsonMessage = message
    rerender()
  })
}

describe('useGameSetup', () => {
  beforeEach(() => {
    socket.lastJsonMessage = null
    socket.readyState = 0
    navigate.mockReset()
    useWebSocketMock.mockClear()
    localStorage.setItem('playerId', playerId)
    vi.mocked(createWebSocketTicket).mockReset()
    vi.mocked(initGame).mockReset().mockResolvedValue(undefined)
    vi.mocked(play).mockReset().mockResolvedValue(undefined)
    vi.mocked(reportClientProtocolDiagnostic)
      .mockReset()
      .mockResolvedValue(undefined)
    vi.mocked(ensurePlayerIdentity).mockReset()
  })

  it('ignores stale, foreign-room, and malformed state messages', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender, result } = renderHook(() => useGameSetup(), { wrapper })

    emitMessage(toGameStateMessage(createGameState(3), roomKey), rerender)
    await waitFor(() => expect(readyState(result.current)?.revision).toBe(3))

    emitMessage(
      toGameStateMessage(createGameState(2, 'Stale Name'), roomKey),
      rerender
    )
    expect(readyState(result.current)?.revision).toBe(3)
    expect(readyState(result.current)?.playerOne.displayName).toBe(
      'Current Name'
    )

    emitMessage(
      toGameStateMessage(createGameState(4, 'Foreign Name'), foreignRoomKey),
      rerender
    )
    expect(readyState(result.current)?.revision).toBe(3)

    emitMessage({ type: 'game.state', version: 1 }, rerender)
    expect(readyState(result.current)?.revision).toBe(3)
    expect(consoleError).toHaveBeenCalledWith(
      'Ignored an invalid game-state message.'
    )
    await waitFor(() =>
      expect(reportClientProtocolDiagnostic).toHaveBeenCalledWith(
        'INVALID_GAME_STATE_MESSAGE'
      )
    )
  })

  it('keeps valid state and reports an unsupported protocol version', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender, result } = renderHook(() => useGameSetup(), { wrapper })
    emitMessage(toGameStateMessage(createGameState(3), roomKey), rerender)
    await waitFor(() => expect(readyState(result.current)?.revision).toBe(3))

    emitMessage(
      {
        ...toGameStateMessage(createGameState(4), roomKey),
        version: 999
      },
      rerender
    )

    expect(readyState(result.current)?.revision).toBe(3)
    expect(readyState(result.current)?.errorMessage).toBe(
      'errors.unsupported-protocol'
    )
    expect(consoleError).toHaveBeenCalledWith(
      'Ignored a message using an unsupported protocol version.'
    )
    await waitFor(() =>
      expect(reportClientProtocolDiagnostic).toHaveBeenCalledWith(
        'UNSUPPORTED_PROTOCOL_VERSION'
      )
    )
  })

  it('keeps ranked timeout counts attached to players after changing perspective', async () => {
    const serverPlayerOne = new Player('player-one', 'Player One')
    const serverPlayerTwo = new Player(playerId, 'Player Two', undefined, 4)
    const gameState = new GameState({
      revision: 1,
      playerOne: serverPlayerOne,
      playerTwo: serverPlayerTwo,
      nextPlayer: serverPlayerTwo,
      outcome: 'ongoing',
      boType: 1,
      rankedTurn: {
        expiresAt: Date.now() + 30_000,
        playerOneTimeouts: 0,
        playerTwoTimeouts: 2
      }
    }).toJson()
    const { rerender, result } = renderHook(() => useGameSetup(), { wrapper })

    emitMessage(toGameStateMessage(gameState, roomKey), rerender)

    await waitFor(() => expect(readyState(result.current)?.revision).toBe(1))
    expect(readyState(result.current)?.playerOne.id).toBe(playerId)
    expect(readyState(result.current)?.rankedTurn).toMatchObject({
      playerOneTimeouts: 2,
      playerTwoTimeouts: 0
    })
  })

  it('returns a player home after their third ranked timeout', async () => {
    const timedOutPlayer = new Player(playerId, 'Timed Out Player')
    const winner = new Player('winner', 'Winner')
    const gameState = new GameState({
      revision: 1,
      playerOne: timedOutPlayer,
      playerTwo: winner,
      nextPlayer: timedOutPlayer,
      outcome: 'game-ended',
      finishReason: 'forfeit',
      forfeitReason: 'timeout',
      winnerId: winner.id,
      boType: 1
    }).toJson()
    const { rerender } = renderHook(() => useGameSetup(), { wrapper })

    emitMessage(toGameStateMessage(gameState, roomKey), rerender)

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/en/', { replace: true })
    )
  })

  it('reinitializes the room whenever the socket reconnects', async () => {
    const { rerender } = renderHook(() => useGameSetup(), { wrapper })
    expect(initGame).not.toHaveBeenCalled()

    act(() => {
      socket.readyState = 1
      rerender()
    })
    await waitFor(() => expect(initGame).toHaveBeenCalledTimes(1))

    act(() => {
      socket.readyState = 3
      rerender()
    })
    act(() => {
      socket.readyState = 1
      rerender()
    })
    await waitFor(() => expect(initGame).toHaveBeenCalledTimes(2))
  })

  it('configures the websocket to reconnect automatically', () => {
    renderHook(() => useGameSetup(), { wrapper })

    const options = useWebSocketMock.mock.calls[0]?.[1]
    expect(options?.shouldReconnect?.()).toBe(true)
    expect(options?.retryOnError).toBe(true)
    expect(options?.reconnectInterval).toBeTypeOf('function')
  })

  it('returns to matchmaking when the ranked assignment has expired', async () => {
    vi.mocked(initGame).mockRejectedValueOnce(
      new ApiRequestError(
        409,
        'The ranked match assignment has expired.',
        'RANKED_ASSIGNMENT_EXPIRED'
      )
    )
    const { rerender } = renderHook(() => useGameSetup(), { wrapper })

    act(() => {
      socket.readyState = 1
      rerender()
    })

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/en/ranked', { replace: true })
    )
  })

  it('tracks valid room presence without replacing game state', async () => {
    const { rerender, result } = renderHook(() => useGameSetup(), { wrapper })
    emitMessage(toGameStateMessage(createGameState(1), roomKey), rerender)
    await waitFor(() => expect(readyState(result.current)?.revision).toBe(1))

    emitMessage(toGamePresenceMessage(roomKey, playerId, true), rerender)
    await waitFor(() =>
      expect(readyState(result.current)?.presenceByPlayerId[playerId]).toBe(
        true
      )
    )
    expect(readyState(result.current)?.revision).toBe(1)

    emitMessage(toGamePresenceMessage(roomKey, playerId, false), rerender)
    await waitFor(() =>
      expect(readyState(result.current)?.presenceByPlayerId[playerId]).toBe(
        false
      )
    )
  })

  it('tracks and clears reconnect deadlines', async () => {
    const { rerender, result } = renderHook(() => useGameSetup(), { wrapper })
    emitMessage(toGameStateMessage(createGameState(1), roomKey), rerender)
    await waitFor(() => expect(readyState(result.current)?.revision).toBe(1))

    emitMessage(
      toGameReconnectDeadlineMessage(roomKey, playerId, 123_456),
      rerender
    )
    await waitFor(() =>
      expect(
        readyState(result.current)?.reconnectDeadlineByPlayerId[playerId]
      ).toBe(123_456)
    )

    emitMessage(toGameReconnectDeadlineMessage(roomKey, playerId, 0), rerender)
    await waitFor(() =>
      expect(
        readyState(result.current)?.reconnectDeadlineByPlayerId[playerId]
      ).toBeUndefined()
    )
  })

  it('clears reconnect deadlines when the game ends', async () => {
    const { rerender, result } = renderHook(() => useGameSetup(), { wrapper })
    emitMessage(toGameStateMessage(createGameState(1), roomKey), rerender)
    emitMessage(
      toGameReconnectDeadlineMessage(roomKey, playerId, 123_456),
      rerender
    )
    await waitFor(() =>
      expect(
        readyState(result.current)?.reconnectDeadlineByPlayerId[playerId]
      ).toBe(123_456)
    )

    emitMessage(
      toGameStateMessage(
        {
          ...createGameState(2),
          outcome: 'game-ended',
          finishReason: 'no-contest'
        },
        roomKey
      ),
      rerender
    )
    await waitFor(() =>
      expect(readyState(result.current)?.reconnectDeadlineByPlayerId).toEqual(
        {}
      )
    )
  })

  it('rolls an optimistic move back after a network failure', async () => {
    vi.mocked(play).mockRejectedValueOnce(new Error('network unavailable'))
    const { rerender, result } = renderHook(() => useGameSetup(), { wrapper })
    emitMessage(toGameStateMessage(createGameState(1), roomKey), rerender)
    await waitFor(() => expect(result.current).not.toBeNull())

    await act(async () => {
      await readyState(result.current)?.sendPlay(0)
    })

    expect(readyState(result.current)?.playerOne.columns).toEqual([[], [], []])
    expect(readyState(result.current)?.errorMessage).toBe('network unavailable')
    expect(readyState(result.current)?.isLoading).toBe(false)
  })

  it('keeps a newer authoritative state instead of rolling back', async () => {
    let rejectPlay: (error: Error) => void = () => {}
    vi.mocked(play).mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectPlay = reject
        })
    )
    const { rerender, result } = renderHook(() => useGameSetup(), { wrapper })
    emitMessage(toGameStateMessage(createGameState(1), roomKey), rerender)
    await waitFor(() => expect(readyState(result.current)?.revision).toBe(1))

    let pendingSend: Promise<void> = Promise.resolve()
    await act(async () => {
      pendingSend = readyState(result.current)?.sendPlay(0) ?? Promise.resolve()
    })

    emitMessage(toGameStateMessage(createGameState(2), roomKey), rerender)
    await waitFor(() => expect(readyState(result.current)?.revision).toBe(2))

    await act(async () => {
      rejectPlay(new Error('network unavailable'))
      await pendingSend
    })

    expect(readyState(result.current)?.revision).toBe(2)
    expect(readyState(result.current)?.errorMessage).toBe('network unavailable')
    expect(readyState(result.current)?.isLoading).toBe(false)
  })

  it('surfaces an identity failure and retries after a reset', async () => {
    localStorage.removeItem('playerId')
    vi.mocked(ensurePlayerIdentity)
      .mockReset()
      .mockRejectedValueOnce(new Error('identity unavailable'))

    const { result } = renderHook(() => useGameSetup(), { wrapper })

    await waitFor(() => expect(result.current).not.toBeNull())
    if (result.current === null || result.current.status !== 'identity-error') {
      throw new Error('Expected the hook to surface the identity error.')
    }
    const errorState = result.current
    expect(errorState.errorMessage).toBe('identity unavailable')

    vi.mocked(ensurePlayerIdentity).mockResolvedValueOnce({
      playerId,
      credential: 'new-credential',
      recoveryPhrase: 'a-phrase'
    } as PlayerCredentials)
    await act(async () => {
      errorState.retryIdentity()
    })

    await waitFor(() => expect(result.current).toBeNull())
  })
})
