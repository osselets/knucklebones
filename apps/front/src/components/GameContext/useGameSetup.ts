import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import useWebSocketImport, { ReadyState } from 'react-use-websocket'
import {
  AI_PLAYER_ID,
  compatibleGameStateMessageSchema,
  gameServerEventSchema,
  GameState,
  getGameStateMessagePayload,
  type IGameState,
  isEmptyOrBlank,
  PROTOCOL_VERSION,
  type GameSettings
} from '@knucklebones/common'
import { useLocalizedPath } from '../../hooks/useLocalizedPath'
import { useRoomKey } from '../../hooks/useRoomKey'
import {
  createWebSocketTicket,
  deleteDisplayName,
  updateDisplayName,
  initGame,
  play,
  reportClientProtocolDiagnostic,
  resignGame,
  voteRematch
} from '../../utils/api'
import { getStoredPlayerId } from '../../utils/identityStorage'
import { getPlayerFromId, getPlayerSide } from '../../utils/player'
import { ensurePlayerIdentity } from '../../utils/playerIdentity'
import { getStoredRankedMatchAssignment } from '../../utils/rankedMatchStorage'
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const localizedPath = useLocalizedPath()
  const [gameState, setGameState] = React.useState<IGameState | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [presenceByPlayerId, setPresenceByPlayerId] = React.useState<
    Record<string, boolean>
  >({})
  const [reconnectDeadlineByPlayerId, setReconnectDeadlineByPlayerId] =
    React.useState<Record<string, number>>({})
  const roomKey = useRoomKey()
  const rankedAssignment = React.useMemo(
    () => getStoredRankedMatchAssignment(roomKey),
    [roomKey]
  )
  const latestRevision = React.useRef({ roomKey, value: -1 })
  const state = useLocation().state as GameSettings | undefined
  const [playerId, setPlayerId] = React.useState(
    () => getStoredPlayerId() ?? undefined
  )
  React.useEffect(() => {
    if (playerId !== undefined) {
      return
    }

    let disposed = false
    void ensurePlayerIdentity()
      .then(({ playerId: nextPlayerId }) => {
        if (!disposed) {
          setPlayerId(nextPlayerId)
        }
      })
      .catch((error) => {
        if (!disposed) {
          setErrorMessage(
            error instanceof Error ? error.message : t('identity.error')
          )
        }
      })

    return () => {
      disposed = true
    }
  }, [playerId, t])
  const getAuthenticatedWebSocketUrl = React.useCallback(async () => {
    const { ticket } = await createWebSocketTicket({
      roomKey,
      playerId: playerId!
    })
    return getWebSocketUrl(roomKey, ticket)
  }, [playerId, roomKey])
  const { lastJsonMessage, readyState } = useWebSocket(
    playerId === undefined ? null : getAuthenticatedWebSocketUrl
  )

  const isGameStateReady = gameState !== null

  const playerSide =
    isGameStateReady && playerId !== undefined
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
      if (
        typeof lastJsonMessage === 'object' &&
        lastJsonMessage !== null &&
        'version' in lastJsonMessage &&
        lastJsonMessage.version !== PROTOCOL_VERSION
      ) {
        void reportClientProtocolDiagnostic(
          'UNSUPPORTED_PROTOCOL_VERSION'
        ).catch(() => undefined)
        console.error(
          'Ignored a message using an unsupported protocol version.'
        )
        setErrorMessage(t('errors.unsupported-protocol'))
        return
      }

      const serverEvent = gameServerEventSchema.safeParse(lastJsonMessage)
      if (serverEvent.success && serverEvent.data.type !== 'game.state') {
        if (
          serverEvent.data.type === 'game.presence' &&
          serverEvent.data.payload.roomKey === roomKey
        ) {
          const presenceEvent = serverEvent.data
          setPresenceByPlayerId((presence) => ({
            ...presence,
            [presenceEvent.payload.playerId]: presenceEvent.payload.connected
          }))
        } else if (
          serverEvent.data.type === 'game.reconnect-deadline' &&
          serverEvent.data.payload.roomKey === roomKey
        ) {
          const deadlineEvent = serverEvent.data
          setReconnectDeadlineByPlayerId((deadlines) => {
            const nextDeadlines = { ...deadlines }
            if (deadlineEvent.payload.expiresAt === 0) {
              delete nextDeadlines[deadlineEvent.payload.playerId]
            } else {
              nextDeadlines[deadlineEvent.payload.playerId] =
                deadlineEvent.payload.expiresAt
            }
            return nextDeadlines
          })
        } else if (serverEvent.data.type === 'game.error') {
          if (serverEvent.data.payload.code === 'RANKED_ASSIGNMENT_EXPIRED') {
            navigate(localizedPath('/ranked'), { replace: true })
            return
          }
          setErrorMessage(serverEvent.data.payload.message)
        }
        return
      }

      const parsedGameState =
        compatibleGameStateMessageSchema.safeParse(lastJsonMessage)

      if (!parsedGameState.success) {
        void reportClientProtocolDiagnostic('INVALID_GAME_STATE_MESSAGE').catch(
          () => undefined
        )
        console.error('Ignored an invalid game-state message.')
        return
      }

      const { gameState: nextGameState, roomKey: messageRoomKey } =
        getGameStateMessagePayload(parsedGameState.data)

      const hasRevision =
        typeof lastJsonMessage === 'object' &&
        lastJsonMessage !== null &&
        ('revision' in lastJsonMessage || 'payload' in lastJsonMessage)

      if (messageRoomKey !== undefined && messageRoomKey !== roomKey) {
        return
      }

      const latestRoomRevision =
        latestRevision.current.roomKey === roomKey
          ? latestRevision.current.value
          : -1

      if (hasRevision && nextGameState.revision <= latestRoomRevision) {
        return
      }

      if (hasRevision) {
        latestRevision.current = {
          roomKey,
          value: nextGameState.revision
        }
      }

      setGameState(nextGameState)
      if (nextGameState.outcome !== 'ongoing') {
        setReconnectDeadlineByPlayerId({})
      }
      setIsLoading(false)
      setErrorMessage(null)
    }
  }, [lastJsonMessage, localizedPath, navigate, roomKey, t])

  React.useEffect(() => {
    setPresenceByPlayerId({})
    setReconnectDeadlineByPlayerId({})
  }, [roomKey])

  React.useEffect(() => {
    if (gameState !== null || rankedAssignment === undefined) {
      return
    }

    const timeout = setTimeout(
      () => navigate(localizedPath('/ranked'), { replace: true }),
      Math.max(0, rankedAssignment.expiresAt - Date.now()) + 500
    )
    return () => clearTimeout(timeout)
  }, [gameState, localizedPath, navigate, rankedAssignment])

  React.useEffect(() => {
    if (readyState === ReadyState.OPEN && playerId !== undefined) {
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
        author: playerId!
      }

      const previousGameState = gameState

      const realGameState = GameState.fromJson(gameState!)
      realGameState.applyPlay(body, false)
      const mutatedGameState = realGameState.toJson()

      setGameState(mutatedGameState)

      await play({ roomKey, playerId: playerId! }, { column }).catch(
        (error) => {
          setErrorMessage(error.message)
          setGameState(previousGameState)
          setIsLoading(false)
        }
      )
    }
  }

  function clearErrorMessage() {
    setErrorMessage(null)
  }

  // Mouais à voir comment on peut repenser les options ici

  async function _voteRematch() {
    await voteRematch({ roomKey, playerId: playerId! }).catch((error) => {
      setErrorMessage(error.message)
    })
  }

  async function resign(): Promise<boolean> {
    try {
      await resignGame({ roomKey })
      return true
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('ranked.resign.error')
      )
      return false
    }
  }

  async function voteContinueBo() {
    await voteRematch({ roomKey, playerId: playerId! }).catch((error) => {
      setErrorMessage(error.message)
    })
  }

  async function voteContinueIndefinitely() {
    await voteRematch(
      { roomKey, playerId: playerId! },
      { boType: 'indefinite' }
    ).catch((error) => {
      setErrorMessage(error.message)
    })
  }

  async function _updateDisplayName(newDisplayName: string) {
    if (isEmptyOrBlank(newDisplayName)) {
      await deleteDisplayName({ roomKey, playerId: playerId! }).catch(
        (error) => {
          setErrorMessage(error.message)
        }
      )
    } else {
      await updateDisplayName(
        { roomKey, playerId: playerId! },
        { displayName: newDisplayName }
      ).catch((error) => {
        setErrorMessage(error.message)
      })
    }
  }

  // Easy way to do a type guard
  if (!isGameStateReady || playerId === undefined) {
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
    presenceByPlayerId,
    reconnectDeadlineByPlayerId,
    sendPlay,
    clearErrorMessage,
    voteContinueBo,
    voteContinueIndefinitely,
    voteRematch: _voteRematch,
    resign,
    updateDisplayName: _updateDisplayName
  }
}
