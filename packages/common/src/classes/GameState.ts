import { type IGameState, type IPlayer } from '../interfaces'
import {
  type Outcome,
  type Play,
  type OutcomeHistory,
  type PlayRejectionReason,
  type PlayerOutcome,
  type BoType
} from '../types'
import { coinflip, getRandomDice, getWinHistory } from '../utils'
import { Log } from './Log'
import { Player } from './Player'

interface GameStateConstructorArg extends Partial<
  Omit<IGameState, 'playerOne' | 'playerTwo' | 'logs' | 'nextPlayer'>
> {
  playerOne: Player
  playerTwo: Player
  nextPlayer?: Player
  logs?: Log[]
}

export class GameState implements IGameState {
  revision: number
  playerOne: Player
  playerTwo: Player
  spectators: string[]
  logs: Log[]
  nextPlayer!: Player
  boType: BoType
  winnerId?: string
  outcome!: Outcome
  outcomeHistory: OutcomeHistory
  rematchVote?: string

  constructor({
    playerOne,
    playerTwo,
    nextPlayer,
    outcome,
    rematchVote,
    winnerId,
    boType = 'indefinite',
    revision = 0,
    logs = [],
    spectators = [],
    outcomeHistory = []
  }: GameStateConstructorArg) {
    this.revision = revision
    this.playerOne = playerOne
    this.playerTwo = playerTwo
    this.logs = logs
    this.spectators = spectators
    this.rematchVote = rematchVote
    this.outcomeHistory = outcomeHistory
    this.boType = boType
    this.winnerId = winnerId

    // Only assign these if we have one
    // otherwise they will be assigned in the initialize() method
    if (outcome !== undefined) {
      this.outcome = outcome
    }

    if (nextPlayer !== undefined) {
      this.nextPlayer = nextPlayer
    }
  }

  initialize(previousGameState?: IGameState) {
    this.outcome = 'ongoing'

    const isPlayerOneStarting = coinflip()

    if (isPlayerOneStarting) {
      this.nextPlayer = this.playerOne
      this.playerOne.dice = getRandomDice()
    } else {
      this.nextPlayer = this.playerTwo
      this.playerTwo.dice = getRandomDice()
    }

    if (previousGameState !== undefined) {
      this.outcomeHistory = previousGameState.outcomeHistory
      this.spectators = previousGameState.spectators
      this.boType = previousGameState?.boType

      if (this.hasBoEnded() && this.boType !== 'indefinite') {
        this.outcomeHistory = []
      }
    }

    this.addToLogs(
      `${this.nextPlayer.getName()} is going first with a ${
        this.nextPlayer.dice
      }.`
    )
  }

  applyPlay(play: Play, giveNextDice = true) {
    const rejectionReason = this.getPlayRejectionReason(play)

    if (rejectionReason !== undefined) {
      throw new Error(`Invalid play: ${rejectionReason}.`)
    }

    const [playerOne, playerTwo] = this.getPlayers(play.author)

    playerOne.addDice(play.dice, play.column)
    this.addToLogs(
      `${playerOne.getName()} added a ${play.dice} in the ${this.getColumnName(
        play.column
      )} column.`
    )

    playerTwo.removeDice(play.dice, play.column)

    if (playerOne.areColumnsFilled()) {
      this.whoWins()
    } else {
      this.nextTurn(play.author, giveNextDice)
    }
  }

  getPlayRejectionReason(play: Play): PlayRejectionReason | undefined {
    if (this.outcome !== 'ongoing') {
      return 'game-ended'
    }

    if (
      play.author !== this.playerOne.id &&
      play.author !== this.playerTwo.id
    ) {
      return 'unknown-player'
    }

    if (play.author !== this.nextPlayer.id) {
      return 'not-player-turn'
    }

    if (play.dice !== this.nextPlayer.dice) {
      return 'unexpected-die'
    }

    if (!Number.isInteger(play.column) || play.column < 0 || play.column > 2) {
      return 'invalid-column'
    }

    const [player] = this.getPlayers(play.author)
    if (player.columns[play.column].length >= 3) {
      return 'column-full'
    }
  }

  addSpectator(spectatorId: string): boolean {
    if (
      this.playerOne.id !== spectatorId &&
      this.playerTwo.id !== spectatorId &&
      !this.spectators.includes(spectatorId)
    ) {
      this.spectators.push(spectatorId)
      return true
    }

    return false
  }

  private getColumnName(column: number) {
    if (column === 0) {
      return 'left'
    } else if (column === 1) {
      return 'middle'
    } else if (column === 2) {
      return 'right'
    } else {
      throw new Error('Unknown column.')
    }
  }

  private getPlayers(playAuthor: string): Player[] {
    if (playAuthor === this.playerOne.id) {
      return [this.playerOne, this.playerTwo]
    } else if (playAuthor === this.playerTwo.id) {
      return [this.playerTwo, this.playerOne]
    } else {
      throw new Error('Unexpected author for move.')
    }
  }

  private nextTurn(lastPlayer: string, giveNextDice = true) {
    const [playerOne, playerTwo] = this.getPlayers(lastPlayer)

    playerOne.dice = undefined

    if (giveNextDice) {
      playerTwo.dice = getRandomDice()
    }

    this.nextPlayer = playerTwo

    this.addToLogs(
      `${playerTwo.getName()} is playing next with a ${playerTwo.dice}.`
    )
  }

  private whoWins() {
    const winner = this.getWinner()
    this.winnerId = winner?.id
    this.outcomeHistory.push({
      playerOne: this.toPlayerOutcome(this.playerOne),
      playerTwo: this.toPlayerOutcome(this.playerTwo)
    })
    this.outcome = this.hasBoEnded() ? 'game-ended' : 'round-ended'

    if (winner !== undefined) {
      this.addToLogs(`${winner.getName()} wins with ${winner.score} points!`)
    } else {
      this.addToLogs(
        `It's a tie... Both players have ${this.playerOne.score} points!`
      )
    }
  }

  private hasBoEnded() {
    if (this.boType === 'indefinite') {
      return true
    }
    const majority = Math.ceil(this.boType / 2)
    const { playerOne, playerTwo } = getWinHistory(this.outcomeHistory).at(-1)!
    return playerOne.wins === majority || playerTwo.wins === majority
  }

  private getWinner() {
    if (this.playerOne.score > this.playerTwo.score) {
      return this.playerOne
    }
    if (this.playerOne.score < this.playerTwo.score) {
      return this.playerTwo
    }
    // tie
  }

  private toPlayerOutcome({ id, score }: IPlayer): PlayerOutcome {
    return {
      id,
      score
    }
  }

  private addToLogs(logLine: string) {
    this.logs.push(new Log(logLine))
  }

  static fromJson({
    playerOne,
    playerTwo,
    nextPlayer,
    logs,
    spectators,
    outcomeHistory,
    ...rest
  }: IGameState) {
    return new GameState({
      ...rest,
      playerOne: Player.fromJson(playerOne),
      playerTwo: Player.fromJson(playerTwo),
      nextPlayer: Player.fromJson(nextPlayer),
      logs: logs.map((iLog) => Log.fromJson(iLog)),
      spectators: [...spectators],
      outcomeHistory: outcomeHistory.map((outcome) => ({
        playerOne: { ...outcome.playerOne },
        playerTwo: { ...outcome.playerTwo }
      }))
    })
  }

  toJson(): IGameState {
    return {
      revision: this.revision,
      playerOne: this.playerOne.toJson(),
      playerTwo: this.playerTwo.toJson(),
      logs: this.logs.map((log) => log.toJson()),
      outcome: this.outcome,
      nextPlayer: this.nextPlayer.toJson(),
      rematchVote: this.rematchVote,
      spectators: this.spectators,
      outcomeHistory: this.outcomeHistory,
      boType: this.boType,
      winnerId: this.winnerId
    }
  }
}
