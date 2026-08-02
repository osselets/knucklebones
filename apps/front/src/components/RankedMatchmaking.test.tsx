import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  getMatchmakingStatus,
  getRankedProfile,
  joinMatchmaking,
  leaveMatchmaking
} from '../utils/api'
import { getStoredRankedMatchAssignment } from '../utils/rankedMatchStorage'
import {
  formatMatchmakingDuration,
  getMatchmakingDelayMessage,
  RankedMatchmaking
} from './RankedMatchmaking'

vi.mock('../utils/api', () => ({
  getMatchmakingStatus: vi.fn(),
  getRankedProfile: vi.fn(),
  joinMatchmaking: vi.fn(),
  leaveMatchmaking: vi.fn()
}))

const playerOneId = '11111111-1111-4111-8111-111111111111'
const playerTwoId = '22222222-2222-4222-8222-222222222222'
const roomKey = '33333333-3333-4333-8333-333333333333'
const assignment = {
  matchId: '44444444-4444-4444-8444-444444444444',
  roomKey,
  queueKey: 'classic:bo1' as const,
  ratingPool: 'classic' as const,
  format: 'bo1' as const,
  playerOneId,
  playerTwoId,
  playerOneRating: 1200,
  playerTwoRating: 1200,
  createdAt: 1000,
  expiresAt: 16_000
}

describe('matchmaking wait display', () => {
  it('formats seconds and minute boundaries', () => {
    expect(formatMatchmakingDuration(0)).toBe('0s')
    expect(formatMatchmakingDuration(59)).toBe('59s')
    expect(formatMatchmakingDuration(60)).toBe('1m 0s')
    expect(formatMatchmakingDuration(62)).toBe('1m 2s')
  })

  it('escalates the wait message at 30 and 60 seconds', () => {
    expect(getMatchmakingDelayMessage(29)).toBeUndefined()
    expect(getMatchmakingDelayMessage(30)).toBe('ranked.queue.slow')
    expect(getMatchmakingDelayMessage(59)).toBe('ranked.queue.slow')
    expect(getMatchmakingDelayMessage(60)).toBe('ranked.queue.scarce')
  })
})

function renderMatchmaking() {
  return render(
    <MemoryRouter initialEntries={['/ranked']}>
      <Routes>
        <Route path='/' element={<p>Home</p>} />
        <Route path='/:language/' element={<p>Home</p>} />
        <Route path='/ranked' element={<RankedMatchmaking />} />
        <Route path='/room/:roomKey' element={<p>Ranked room</p>} />
        <Route path='/:language/room/:roomKey' element={<p>Ranked room</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RankedMatchmaking', () => {
  beforeEach(() => {
    vi.mocked(getRankedProfile).mockReset()
    vi.mocked(joinMatchmaking).mockReset()
    vi.mocked(getMatchmakingStatus).mockReset()
    vi.mocked(leaveMatchmaking).mockReset()
    sessionStorage.clear()
    vi.mocked(getRankedProfile).mockResolvedValue({
      playerId: playerOneId,
      ratingPool: 'classic',
      rating: 1200,
      gamesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0
    })
    vi.mocked(getMatchmakingStatus).mockResolvedValue({
      status: 'waiting',
      joinedAt: Date.now(),
      population: { queuedPlayers: 3, activePlayers: 8 }
    })
    vi.mocked(leaveMatchmaking).mockResolvedValue()
  })

  it('stores an assignment and navigates to its ranked room', async () => {
    vi.mocked(joinMatchmaking).mockResolvedValue({
      status: 'matched',
      match: assignment
    })

    renderMatchmaking()

    expect(await screen.findByText('Ranked room')).toBeInTheDocument()
    expect(getStoredRankedMatchAssignment(roomKey)).toEqual(assignment)
  })

  it('shows the rating and cancels a waiting ticket', async () => {
    vi.mocked(joinMatchmaking).mockResolvedValue({
      status: 'waiting',
      joinedAt: Date.now(),
      population: { queuedPlayers: 3, activePlayers: 8 }
    })

    renderMatchmaking()

    expect(await screen.findByText('ranked.rating')).toBeInTheDocument()
    expect(screen.getByText('ranked.queue.in-queue')).toBeInTheDocument()
    expect(screen.getByText('ranked.queue.playing')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'ranked.queue.cancel' })
    )

    await waitFor(() => expect(leaveMatchmaking).toHaveBeenCalledOnce())
    expect(await screen.findByText('Home')).toBeInTheDocument()
  })
})
