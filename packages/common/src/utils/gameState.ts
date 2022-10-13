import { GameState } from '../types/gameState'
import { countDiceInColumn } from '../utils/count'
import { Play } from '../types/play'
import { emptyPlayerState, Player } from '../types/player'
import { GameOutcome } from '../types/gameOutcome'
import { getRandomDice, getRandomValue } from './random'
import { getName, getNameFromPlayer } from './name'

export function initializePlayers(
  gameState: GameState,
  playerId: string,
  displayName?: string
): GameState {
  if (gameState.gameOutcome !== 'not-started') {
    if (
      gameState.playerOne?.id !== playerId &&
      gameState.playerTwo?.id !== playerId
    ) {
      addLog(gameState, `${playerId} has joined as a spectator`)
    }
    return gameState
  }

  if (gameState.playerOne === undefined) {
    gameState.playerOne = emptyPlayerState(playerId, displayName)
    addLog(
      gameState,
      `${getName(playerId, displayName)} has connected to the game`
    )
  } else if (
    gameState.playerTwo === undefined &&
    playerId !== gameState.playerOne.id
  ) {
    gameState.playerTwo = emptyPlayerState(playerId, displayName)
    addLog(
      gameState,
      `${getName(playerId, displayName)} has connected to the game`
    )

    const isPlayerOneStarting = getRandomValue() > 0.5
    if (isPlayerOneStarting) {
      gameState.nextPlayer = gameState.playerOne
      gameState.playerOne.dice = getRandomDice()
    } else {
      gameState.nextPlayer = gameState.playerTwo
      gameState.playerTwo.dice = getRandomDice()
    }
    gameState.gameOutcome = 'ongoing'
    addLog(
      gameState,
      `${getNameFromPlayer(gameState.nextPlayer)} is going to play first`
    )
  }

  return gameState
}

export function addLog(gameState: GameState, log: string) {
  gameState.logs.push({
    timestamp: Date.now(),
    content: log
  })
}

export function mutateGameState(
  play: Play,
  playerId: string,
  gameState: GameState
): GameState {
  const copiedGameState = structuredClone(gameState)

  const [playerOne, playerTwo] = getPlayers(playerId, copiedGameState)

  placeDice(playerOne, play, copiedGameState)

  removeFromPlayerTwoColumns(play, playerTwo)

  updateScores(copiedGameState)

  if (isBoardFull(playerOne)) {
    copiedGameState.gameOutcome = computeGameOutcome(
      playerOne,
      playerTwo,
      copiedGameState
    )
  } else {
    playerOne.dice = undefined
    playerTwo.dice = getRandomDice()
    copiedGameState.nextPlayer = playerTwo
    addLog(
      copiedGameState,
      `${getNameFromPlayer(playerTwo)} is going to play next with a ${
        playerTwo.dice
      }`
    )
  }

  return copiedGameState
}

function getPlayers(playerId: string, gameState: GameState): [Player, Player] {
  if (playerId === gameState.playerOne?.id) {
    return [gameState.playerOne, gameState.playerTwo!]
  } else if (playerId === gameState.playerTwo?.id) {
    return [gameState.playerTwo, gameState.playerOne!]
  } else {
    throw new Error('Unexpected playerId received.')
  }
}

function placeDice(player: Player, play: Play, gameState: GameState) {
  player.columns[play.column].push(play.value)
  addLog(
    gameState,
    `${getNameFromPlayer(player)} placed a dice in the ${getColumn(
      play.column
    )} column with a value of ${play.value}`
  )
}

function getColumn(columnIndex: number) {
  if (columnIndex === 0) {
    return 'left'
  } else if (columnIndex === 1) {
    return 'middle'
  } else {
    return 'right'
  }
}

function removeFromPlayerTwoColumns(play: Play, playerTwo: Player) {
  playerTwo.columns = playerTwo.columns.map((column, colIndex) => {
    if (colIndex === play.column) {
      return column.filter((dice) => dice !== play.value)
    }
    return column
  })
}

function isBoardFull(player: Player): boolean {
  return player.columns.flat().length === 9
}

function updateScores(gameState: GameState) {
  updateScore(gameState.playerOne!)
  updateScore(gameState.playerTwo!)
}

function updateScore(player: Player) {
  const scorePerColumn = player.columns.map((column) => {
    const countedDice = countDiceInColumn(column)
    return getColumnScore(countedDice)
  })
  const score = scorePerColumn.reduce((acc, total) => acc + total, 0)

  player.scorePerColumn = scorePerColumn
  player.score = score
}

function getColumnScore(countedDice: Map<number, number>) {
  return [...countedDice.entries()].reduce((acc, [dice, count]) => {
    return acc + getDiceScore(dice, count)
  }, 0)
}

function getDiceScore(dice: number, count: number) {
  return dice * Math.pow(count, 2)
}

function computeGameOutcome(
  playerOne: Player,
  playerTwo: Player,
  gameState: GameState
): GameOutcome {
  if (playerOne.score > playerTwo.score) {
    addLog(
      gameState,
      `${getNameFromPlayer(playerOne)} wins with a score of ${playerOne.score}`
    )
    return isPlayerOneReallyPlayerOne(playerOne, gameState)
      ? 'player-one-win'
      : 'player-two-win'
  } else if (playerOne.score < playerTwo.score) {
    addLog(
      gameState,
      `${getNameFromPlayer(playerTwo)} wins with a score of ${playerTwo.score}`
    )
    return isPlayerOneReallyPlayerOne(playerOne, gameState)
      ? 'player-two-win'
      : 'player-one-win'
  } else {
    addLog(
      gameState,
      `It's a tie! Both players have a score of ${playerOne.score}`
    )
    return 'tie'
  }
}

function isPlayerOneReallyPlayerOne(
  playerOne: Player,
  gameState: GameState
): boolean {
  return playerOne.id === gameState.playerOne?.id
}
