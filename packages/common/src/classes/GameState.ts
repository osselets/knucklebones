import { type IGameState, type IPlayer } from '../interfaces'
import {
  type Outcome,
  type Play,
  type OutcomeHistory,
  type PlayerOutcome,
  type BoType,
  type GameMode
} from '../types'
import { coinflip, getRandomDice, getWinHistory } from '../utils'
import { DicePool } from './DicePool'
import { Log } from './Log'
import { Player } from './Player'

interface GameStateConstructorArg
  extends Partial<
    Omit<
      IGameState,
      'playerOne' | 'playerTwo' | 'logs' | 'nextPlayer' | 'dicePool'
    >
  > {
  playerOne: Player
  playerTwo: Player
  nextPlayer?: Player
  logs?: Log[]
  dicePool?: DicePool
}

export class GameState implements IGameState {
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
  gameMode: GameMode
  dicePool?: DicePool

  constructor({
    playerOne,
    playerTwo,
    nextPlayer,
    outcome,
    rematchVote,
    winnerId,
    gameMode = 'classic',
    dicePool,
    boType = 'indefinite',
    logs = [],
    spectators = [],
    outcomeHistory = []
  }: GameStateConstructorArg) {
    this.playerOne = playerOne
    this.playerTwo = playerTwo
    this.logs = logs
    this.spectators = spectators
    this.rematchVote = rematchVote
    this.outcomeHistory = outcomeHistory
    this.boType = boType
    this.winnerId = winnerId
    this.gameMode = gameMode
    this.dicePool = dicePool

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

    // Idéalement, on devrait utiliser une discriminated union pour s'assurer
    // que `dicePool` est forcément accessible quand le `gameMode` est `dice-pool`.
    // Aussi on peut pas déplacer la vérification dans une condition, sinon le
    // type guard est pas effectif.
    if (this.gameMode === 'dice-pool') {
      this.dicePool = new DicePool()
    }

    const isPlayerOneStarting = coinflip()

    if (isPlayerOneStarting) {
      this.nextPlayer = this.playerOne
      this.playerOne.dice = this.getRandomDice()
    } else {
      this.nextPlayer = this.playerTwo
      this.playerTwo.dice = this.getRandomDice()
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
    const [playerOne, playerTwo] = this.getPlayers(play.author)

    playerOne.addDice(play.dice, play.column)
    this.addToLogs(
      `${playerOne.getName()} added a ${play.dice} in the ${this.getColumnName(
        play.column
      )} column.`
    )

    const removedDice = playerTwo.removeDice(play.dice, play.column)

    if (playerOne.areColumnsFilled()) {
      this.whoWins()
    } else {
      if (this.gameMode === 'dice-pool' && this.dicePool !== undefined) {
        this.dicePool.putDieBackInPool(play.dice, removedDice)
      }
      this.nextTurn(play.author, giveNextDice)
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

  private getRandomDice() {
    if (this.gameMode === 'dice-pool' && this.dicePool !== undefined) {
      return this.dicePool.getAndRemoveDieFromPool()
    }
    return getRandomDice()
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
      playerTwo.dice = this.getRandomDice()
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
    dicePool,
    ...rest
  }: IGameState) {
    return new GameState({
      ...rest,
      playerOne: Player.fromJson(playerOne),
      playerTwo: Player.fromJson(playerTwo),
      nextPlayer: Player.fromJson(nextPlayer),
      logs: logs.map((iLog) => Log.fromJson(iLog)),
      dicePool: dicePool !== undefined ? new DicePool(dicePool.pool) : dicePool
    })
  }

  toJson(): IGameState {
    return {
      playerOne: this.playerOne.toJson(),
      playerTwo: this.playerTwo.toJson(),
      logs: this.logs.map((log) => log.toJson()),
      gameMode: this.gameMode,
      dicePool: this.dicePool?.toJson(),
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
