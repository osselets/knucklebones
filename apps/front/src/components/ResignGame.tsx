import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { FlagIcon } from '@heroicons/react/24/outline'
import { useRoomKey } from '../hooks/useRoomKey'
import { getStoredRankedMatchAssignment } from '../utils/rankedMatchStorage'
import { Button } from './Button'
import { useGame } from './GameContext'
import { ShortcutModal } from './ShortcutModal'

export function ResignGame() {
  const { t } = useTranslation()
  const roomKey = useRoomKey()
  const { outcome, playerSide, resign } = useGame()
  const [isResigning, setIsResigning] = React.useState(false)
  const rankedAssignment = React.useMemo(
    () => getStoredRankedMatchAssignment(roomKey),
    [roomKey]
  )

  if (
    rankedAssignment === undefined ||
    outcome !== 'ongoing' ||
    playerSide === 'spectator'
  ) {
    return null
  }

  return (
    <ShortcutModal icon={<FlagIcon />} label={t('ranked.resign.action')}>
      <div className='grid max-w-md gap-4'>
        <h2 className='font-mona text-2xl font-bold'>
          {t('ranked.resign.title')}
        </h2>
        <p>{t('ranked.resign.warning')}</p>
        <Button
          disabled={isResigning}
          onClick={() => {
            setIsResigning(true)
            void resign().then((didResign) => {
              if (!didResign) setIsResigning(false)
            })
          }}
        >
          {t(isResigning ? 'ranked.resign.resigning' : 'ranked.resign.confirm')}
        </Button>
      </div>
    </ShortcutModal>
  )
}
