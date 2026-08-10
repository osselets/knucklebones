import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { getRankedProfile } from '../utils/api'
import { useGame } from './GameContext'
import { GameOutcome } from './GameOutcome'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key} ${JSON.stringify(values)}`
  })
}))

vi.mock('../hooks/detectDevice', () => ({
  useIsOnDesktop: () => true
}))

vi.mock('../hooks/useLocalizedPath', () => ({
  useLocalizedPath: () => (path: string) => path
}))

vi.mock('../hooks/useRoomKey', () => ({
  useRoomKey: () => '33333333-3333-4333-8333-333333333333'
}))

vi.mock('../utils/api', () => ({
  getRankedProfile: vi.fn(),
  getRankedRematchStatus: vi.fn(),
  requestRankedRematch: vi.fn()
}))

vi.mock('../utils/identityStorage', () => ({
  getStoredPlayerId: () => '11111111-1111-4111-8111-111111111111'
}))

vi.mock('../utils/rankedMatchStorage', () => ({
  getStoredRankedMatchAssignment: () => ({
    matchId: '44444444-4444-4444-8444-444444444444',
    roomKey: '33333333-3333-4333-8333-333333333333',
    queueKey: 'classic:bo1',
    ratingPool: 'classic',
    format: 'bo1',
    playerOneId: '11111111-1111-4111-8111-111111111111',
    playerTwoId: '22222222-2222-4222-8222-222222222222',
    playerOneRating: 1200,
    playerTwoRating: 1200,
    createdAt: 1,
    expiresAt: 2
  }),
  storeRankedMatchAssignment: vi.fn()
}))

vi.mock('./GameContext', () => ({
  useGame: vi.fn()
}))

function rankedGame(isLoading: boolean) {
  const playerOne = {
    id: '11111111-1111-4111-8111-111111111111',
    inGameName: 'Player One',
    isPlayerOne: true,
    score: 10
  }
  const playerTwo = {
    id: '22222222-2222-4222-8222-222222222222',
    inGameName: 'Player Two',
    isPlayerOne: false,
    score: 20
  }

  return {
    outcome: 'game-ended',
    winner: playerTwo,
    finishReason: 'completed',
    forfeitReason: undefined,
    isLoading,
    playerSide: 'player-one',
    playerOne,
    playerTwo,
    rematchVote: undefined,
    presenceByPlayerId: {},
    boType: 1,
    voteRematch: vi.fn(),
    voteContinueBo: vi.fn(),
    voteContinueIndefinitely: vi.fn()
  }
}

describe('GameOutcome ranked rating', () => {
  beforeEach(() => {
    vi.mocked(getRankedProfile).mockReset()
    vi.mocked(getRankedProfile).mockResolvedValue({
      playerId: '11111111-1111-4111-8111-111111111111',
      ratingPool: 'classic',
      rating: 1184,
      gamesPlayed: 1,
      wins: 0,
      draws: 0,
      losses: 1
    })
  })

  it('waits for the authoritative final state before loading the rating', async () => {
    vi.mocked(useGame).mockReturnValue(rankedGame(true) as never)
    const view = render(
      <MemoryRouter>
        <GameOutcome />
      </MemoryRouter>
    )

    expect(getRankedProfile).not.toHaveBeenCalled()

    vi.mocked(useGame).mockReturnValue(rankedGame(false) as never)
    view.rerender(
      <MemoryRouter>
        <GameOutcome />
      </MemoryRouter>
    )

    await waitFor(() => expect(getRankedProfile).toHaveBeenCalledOnce())
    expect(
      await screen.findByText(/ranked.result.rating-change/)
    ).toHaveTextContent('1184')
  })

  it('disables ranked rematches after a timeout forfeit', () => {
    const game = rankedGame(false)
    vi.mocked(useGame).mockReturnValue({
      ...game,
      winner: game.playerOne,
      finishReason: 'forfeit',
      forfeitReason: 'timeout'
    } as never)

    render(
      <MemoryRouter>
        <GameOutcome />
      </MemoryRouter>
    )

    expect(
      screen.getByRole('button', { name: 'ranked.result.rematch' })
    ).toBeDisabled()
  })
})
