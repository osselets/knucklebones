import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useRoomKey } from '../hooks/useRoomKey'
import { getStoredPlayerId } from '../utils/identityStorage'
import { getStoredRankedMatchAssignment } from '../utils/rankedMatchStorage'

export function RankedMatchInfo() {
  const { t } = useTranslation()
  const roomKey = useRoomKey()
  const assignment = React.useMemo(
    () => getStoredRankedMatchAssignment(roomKey),
    [roomKey]
  )
  const playerId = getStoredPlayerId()

  if (assignment === undefined || playerId === null) {
    return null
  }

  const opponentRating =
    playerId === assignment.playerOneId
      ? assignment.playerTwoRating
      : playerId === assignment.playerTwoId
        ? assignment.playerOneRating
        : undefined
  if (opponentRating === undefined) {
    return null
  }

  return (
    <div className='grid gap-1 rounded-md border-2 border-slate-300 p-2 dark:border-slate-600'>
      <p className='font-semibold'>{t('ranked.match.label')}</p>
      <p>{t('ranked.match.opponent-rating', { rating: opponentRating })}</p>
    </div>
  )
}
