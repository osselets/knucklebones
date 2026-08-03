import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useIsOnMobile } from '../hooks/detectDevice'
import { useNoIndex } from '../hooks/useNoIndex'
import { Button } from './Button'
import { useGameWhileLoading } from './GameContext'
import { GameOutcome } from './GameOutcome'
import { HowToPlayModal } from './HowToPlay'
import { Loading } from './Loading'
import { OutcomeHistory } from './OutcomeHistory'
import { PlayerOneBoard, PlayerTwoBoard } from './PlayerBoard'
import { QRCodeModal } from './QRCode'
import { RankedMatchInfo } from './RankedMatchInfo'
import { ReconnectNotice } from './ReconnectNotice'
import { ResignGame } from './ResignGame'
import { SideBarActions } from './SideBar'
import { WarningToast } from './WarningToast'

export function Game() {
  const gameStore = useGameWhileLoading()
  const { t } = useTranslation()
  const isOnMobile = useIsOnMobile()
  const gameRef = React.useRef<React.ElementRef<'div'>>(null)
  useNoIndex()

  if (gameStore === null) {
    return <Loading />
  }

  if (gameStore.status === 'identity-error') {
    return (
      <div className='flex flex-col items-center justify-center gap-4 p-4 text-center'>
        <p className='text-lg'>{gameStore.errorMessage}</p>
        <Button size='medium' onClick={gameStore.retryIdentity}>
          {t('identity.retry')}
        </Button>
      </div>
    )
  }

  const { errorMessage, clearErrorMessage } = gameStore

  // Pas tip top je trouve, mais virtuellement ça marche
  const gameOutcome = <GameOutcome />

  return (
    <>
      <SideBarActions>
        <HowToPlayModal />
        <QRCodeModal />
        <OutcomeHistory />
        <ResignGame />
        <RankedMatchInfo />
        {isOnMobile && gameOutcome}
      </SideBarActions>
      <div ref={gameRef} className='flex flex-col items-center justify-around'>
        <ReconnectNotice />
        <PlayerTwoBoard />
        {!isOnMobile && gameOutcome}
        <PlayerOneBoard />
        <WarningToast message={errorMessage} onDismiss={clearErrorMessage} />
      </div>
    </>
  )
}
