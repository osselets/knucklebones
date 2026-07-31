import { createDurable } from 'itty-durable'
import {
  type BoType,
  type Difficulty,
  type GameSettings,
  GameState,
  type IGameState,
  type ILobby,
  Lobby,
  Player,
  type Play
} from '@knucklebones/common'
import { type CloudflareEnvironment } from '../types/cloudflareEnvironment'
import { type IttyDurableObjectNamespace } from '../types/itty'

interface InitializeGameCommand {
  playerId: string
  displayName?: string
  difficulty?: Difficulty
  boType?: BoType
}

export type InitializeGameResult =
  | { status: 'waiting' }
  | { status: 'created' | 'existing'; gameState: IGameState }

export type RematchGameResult =
  | { status: 'game-ongoing' | 'unchanged' }
  | { status: 'updated'; gameState: IGameState }

export type UpdateDisplayNameResult =
  { status: 'unknown-player' } | { status: 'updated'; gameState: IGameState }

export class GameStateDurableObject extends createDurable({
  autoPersist: true
}) {
  lobby: ILobby
  gameState?: IGameState

  constructor(
    state: DurableObjectState,
    cloudflareEnvironment: CloudflareEnvironment
  ) {
    super(state, cloudflareEnvironment)
    this.lobby = new Lobby().toJson()
  }

  initializeGame({
    playerId,
    displayName,
    difficulty,
    boType
  }: InitializeGameCommand): InitializeGameResult {
    if (this.gameState !== undefined) {
      const gameState = GameState.fromJson(this.gameState)

      if (gameState.addSpectator(playerId)) {
        this.gameState = gameState.toJson()
      }

      return { status: 'existing', gameState: gameState.toJson() }
    }

    const lobby = Lobby.fromJson(this.lobby)
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

    const gameState = lobby.toGameState().toJson()
    this.gameState = gameState

    return { status: 'created', gameState }
  }

  play(play: Play): IGameState {
    const gameState = this.getInitializedGameState()
    gameState.applyPlay(play)
    this.gameState = gameState.toJson()
    return this.gameState
  }

  rematch(
    playerId: string,
    gameSettings?: Omit<GameSettings, 'playerType'>
  ): RematchGameResult {
    const gameState = this.getInitializedGameState()

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
      this.gameState = newGameState.toJson()
      return { status: 'updated', gameState: this.gameState }
    }

    if (gameState.rematchVote === undefined) {
      gameState.rematchVote = playerId
      this.gameState = gameState.toJson()
      return { status: 'updated', gameState: this.gameState }
    }

    return { status: 'unchanged' }
  }

  updateDisplayName(
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

    this.gameState = gameState.toJson()
    return { status: 'updated', gameState: this.gameState }
  }

  private getInitializedGameState(): GameState {
    if (this.gameState === undefined) {
      throw new Error('Game state is not initialized.')
    }

    return GameState.fromJson(this.gameState)
  }
}

export interface GameStateDurableObjectProps {
  GAME_STATE_DURABLE_OBJECT: IttyDurableObjectNamespace<GameStateDurableObject>
}
