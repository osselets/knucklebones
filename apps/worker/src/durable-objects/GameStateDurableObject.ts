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
  type Play,
  type PlayRejectionReason
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

export type PlayGameResult =
  | { status: 'rejected'; reason: PlayRejectionReason }
  | { status: 'updated'; gameState: IGameState }

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
      let serializedGameState = gameState.toJson()

      if (gameState.addSpectator(playerId)) {
        serializedGameState = this.commitGameState(gameState)
      }

      return { status: 'existing', gameState: serializedGameState }
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

    const gameState = this.commitGameState(lobby.toGameState())

    return { status: 'created', gameState }
  }

  play(play: Play): PlayGameResult {
    const gameState = this.getInitializedGameState()
    const rejectionReason = gameState.getPlayRejectionReason(play)

    if (rejectionReason !== undefined) {
      return { status: 'rejected', reason: rejectionReason }
    }

    gameState.applyPlay(play)
    return { status: 'updated', gameState: this.commitGameState(gameState) }
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
      return {
        status: 'updated',
        gameState: this.commitGameState(newGameState)
      }
    }

    if (gameState.rematchVote === undefined) {
      gameState.rematchVote = playerId
      return {
        status: 'updated',
        gameState: this.commitGameState(gameState)
      }
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

    return {
      status: 'updated',
      gameState: this.commitGameState(gameState)
    }
  }

  private commitGameState(gameState: GameState): IGameState {
    gameState.revision = (this.gameState?.revision ?? 0) + 1
    this.gameState = gameState.toJson()
    return this.gameState
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
