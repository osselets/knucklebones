import * as React from 'react'
import { useLocation } from 'react-router-dom'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import {
  GameState,
  type IGameState,
  isEmptyOrBlank,
  type GameSettings
} from '@knucklebones/common'
import { useRoomKey } from '../../hooks/useRoomKey'
import {
  deleteDisplayName,
  updateDisplayName,
  initGame,
  play,
  voteRematch
} from '../../utils/api'
import { getPlayerFromId, getPlayerSide } from '../../utils/player'
import { getWebSocketUrl, preparePlayers } from './utils'

export function useGameSetup() {
  const [gameState, setGameState] = React.useState<IGameState | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const roomKey = useRoomKey()
  const state = useLocation().state as GameSettings | undefined
  const { lastJsonMessage, readyState } = useWebSocket(getWebSocketUrl(roomKey))

  const isGameStateReady = gameState !== null

  const playerId = localStorage.getItem('playerId')!
  const playerSide = isGameStateReady
    ? getPlayerSide(playerId, gameState)
    : 'spectator'
  const [playerOne, playerTwo] = isGameStateReady
    ? preparePlayers(playerSide, gameState)
    : []

  const winner =
    gameState?.winnerId !== undefined
      ? getPlayerFromId(gameState.winnerId, { playerOne, playerTwo })
      : undefined

  React.useEffect(() => {
    if (lastJsonMessage !== null) {
      // Can use Zod to parse the message safely
      const gameState = lastJsonMessage as IGameState
      setGameState(gameState)
      setIsLoading(false)
      setErrorMessage(null)
    }
  }, [lastJsonMessage])

  React.useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      initGame(
        { roomKey, playerId },
        {
          playerType: 'human',
          boType: state?.boType,
          gameMode: state?.gameMode ?? 'classic'
        }
      )
        .then(async () => {
          // À déplacer côté serveur
          if (state?.playerType === 'ai') {
            await initGame(
              { roomKey, playerId: 'beep-boop' },
              {
                playerType: 'ai',
                difficulty: state?.difficulty,
                boType: state?.boType,
                gameMode: state?.gameMode
              }
            )
          }
        })
        .catch((error) => {
          setErrorMessage(error.message)
        })
    }
  }, [roomKey, playerId, readyState, state])

  async function sendPlay(column: number) {
    const dice = playerOne?.dice
    if (dice !== undefined && !isLoading) {
      setIsLoading(true)

      const body = {
        column,
        dice,
        author: playerId
      }

      const previousGameState = gameState

      const realGameState = GameState.fromJson(gameState!)
      realGameState.applyPlay(body, false)
      const mutatedGameState = realGameState.toJson()

      setGameState(mutatedGameState)

      await play({ roomKey, playerId }, { column, dice }).catch((error) => {
        setErrorMessage(error.message)
        setGameState(previousGameState)
        setIsLoading(false)
      })
    }
  }

  function clearErrorMessage() {
    setErrorMessage(null)
  }

  // Mouais à voir comment on peut repenser les options ici

  async function _voteRematch() {
    await voteRematch({ roomKey, playerId }).catch((error) => {
      setErrorMessage(error.message)
    })
  }

  async function voteContinueBo() {
    await voteRematch({ roomKey, playerId }).catch((error) => {
      setErrorMessage(error.message)
    })
  }

  async function voteContinueIndefinitely() {
    await voteRematch({ roomKey, playerId }, { boType: 'indefinite' }).catch(
      (error) => {
        setErrorMessage(error.message)
      }
    )
  }

  async function _updateDisplayName(newDisplayName: string) {
    if (isEmptyOrBlank(newDisplayName)) {
      await deleteDisplayName({ roomKey, playerId }).catch((error) => {
        setErrorMessage(error.message)
      })
    } else {
      await updateDisplayName(
        { roomKey, playerId },
        { displayName: newDisplayName }
      ).catch((error) => {
        setErrorMessage(error.message)
      })
    }
  }

  // Easy way to do a type guard
  if (!isGameStateReady) {
    return null
  }

  return {
    ...gameState,
    isLoading,
    playerOne,
    playerTwo,
    playerId,
    playerSide,
    winner,
    errorMessage,
    sendPlay,
    clearErrorMessage,
    voteContinueBo,
    voteContinueIndefinitely,
    voteRematch: _voteRematch,
    updateDisplayName: _updateDisplayName
  }
}
