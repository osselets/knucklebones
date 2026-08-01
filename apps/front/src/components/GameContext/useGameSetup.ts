import * as React from 'react'
import { useLocation } from 'react-router-dom'
import useWebSocketImport, { ReadyState } from 'react-use-websocket'
import {
  AI_PLAYER_ID,
  compatibleGameStateMessageSchema,
  GameState,
  type IGameState,
  isEmptyOrBlank,
  type GameSettings
} from '@knucklebones/common'
import { useRoomKey } from '../../hooks/useRoomKey'
import {
  createWebSocketTicket,
  deleteDisplayName,
  updateDisplayName,
  initGame,
  play,
  voteRematch
} from '../../utils/api'
import { getPlayerFromId, getPlayerSide } from '../../utils/player'
import { getWebSocketUrl, preparePlayers } from './utils'

// react-use-websocket 4.13 publishes a CommonJS object containing its default
// export. Vite 8 exposes that object directly when the importer is ESM.
const useWebSocket =
  (
    useWebSocketImport as unknown as {
      default?: typeof useWebSocketImport
    }
  ).default ?? useWebSocketImport

export function useGameSetup() {
  const [gameState, setGameState] = React.useState<IGameState | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const roomKey = useRoomKey()
  const latestRevision = React.useRef({ roomKey, value: -1 })
  const state = useLocation().state as GameSettings | undefined
  const playerId = localStorage.getItem('playerId')!
  const getAuthenticatedWebSocketUrl = React.useCallback(async () => {
    const { ticket } = await createWebSocketTicket({ roomKey, playerId })
    return getWebSocketUrl(roomKey, ticket)
  }, [playerId, roomKey])
  const { lastJsonMessage, readyState } = useWebSocket(
    getAuthenticatedWebSocketUrl
  )

  const isGameStateReady = gameState !== null

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
      const parsedGameState =
        compatibleGameStateMessageSchema.safeParse(lastJsonMessage)

      if (!parsedGameState.success) {
        console.error('Ignored an invalid game-state message.')
        return
      }

      const hasRevision =
        typeof lastJsonMessage === 'object' &&
        lastJsonMessage !== null &&
        'revision' in lastJsonMessage

      const messageRoomKey =
        typeof lastJsonMessage === 'object' &&
        lastJsonMessage !== null &&
        'roomKey' in lastJsonMessage &&
        typeof lastJsonMessage.roomKey === 'string'
          ? lastJsonMessage.roomKey
          : undefined

      if (messageRoomKey !== undefined && messageRoomKey !== roomKey) {
        return
      }

      const latestRoomRevision =
        latestRevision.current.roomKey === roomKey
          ? latestRevision.current.value
          : -1

      if (hasRevision && parsedGameState.data.revision <= latestRoomRevision) {
        return
      }

      if (hasRevision) {
        latestRevision.current = {
          roomKey,
          value: parsedGameState.data.revision
        }
      }

      setGameState(parsedGameState.data)
      setIsLoading(false)
      setErrorMessage(null)
    }
  }, [lastJsonMessage, roomKey])

  React.useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      initGame(
        { roomKey, playerId },
        { playerType: 'human', boType: state?.boType }
      )
        .then(async () => {
          // À déplacer côté serveur
          if (state?.playerType === 'ai') {
            await initGame(
              { roomKey, playerId: AI_PLAYER_ID },
              {
                playerType: 'ai',
                difficulty: state?.difficulty,
                boType: state?.boType
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
