import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useGame } from './GameContext'

export function ReconnectNotice() {
  const { t } = useTranslation()
  const { reconnectDeadlineByPlayerId, playerOne, playerTwo } = useGame()
  const [now, setNow] = React.useState(Date.now())
  const activeDeadline = Object.entries(reconnectDeadlineByPlayerId).sort(
    ([, left], [, right]) => left - right
  )[0]
  const activeDeadlineExpiresAt = activeDeadline?.[1]

  React.useEffect(() => {
    if (activeDeadlineExpiresAt === undefined) {
      return
    }

    const interval = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(interval)
  }, [activeDeadlineExpiresAt])

  if (activeDeadline === undefined) {
    return null
  }

  const [disconnectedPlayerId, expiresAt] = activeDeadline
  const disconnectedPlayer =
    playerOne.id === disconnectedPlayerId ? playerOne : playerTwo
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1_000))

  return (
    <div
      role='status'
      className='fixed top-4 z-10 rounded-lg bg-amber-100 px-4 py-3 text-amber-900 shadow dark:bg-amber-900 dark:text-amber-100'
    >
      {t('reconnect.deadline', {
        player: disconnectedPlayer.displayName ?? disconnectedPlayer.id,
        seconds
      })}
    </div>
  )
}
