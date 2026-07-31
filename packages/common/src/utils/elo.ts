import {
  ELO_K_FACTOR,
  type EloMatchResult,
  type EloRatingUpdate
} from '../types'

export function calculateEloRatings(
  playerOneRating: number,
  playerTwoRating: number,
  result: EloMatchResult
): EloRatingUpdate {
  const playerOneExpectedScore = expectedScore(playerOneRating, playerTwoRating)
  const playerOneScore = getPlayerOneScore(result)
  const playerOneChange = Math.round(
    ELO_K_FACTOR * (playerOneScore - playerOneExpectedScore)
  )

  return {
    playerOne: {
      before: playerOneRating,
      after: playerOneRating + playerOneChange,
      change: playerOneChange
    },
    playerTwo: {
      before: playerTwoRating,
      after: playerTwoRating - playerOneChange,
      change: -playerOneChange
    }
  }
}

function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400))
}

function getPlayerOneScore(result: EloMatchResult): number {
  switch (result) {
    case 'player-one-win':
      return 1
    case 'draw':
      return 0.5
    case 'player-two-win':
      return 0
  }
}
