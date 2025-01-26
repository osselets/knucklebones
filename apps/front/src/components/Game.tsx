import * as React from 'react'
import { useIsOnMobile } from '../hooks/detectDevice'
import { useNoIndex } from '../hooks/useNoIndex'
import { useGameWhileLoading } from './GameContext'
import { GameMode } from './GameMode'
import { GameOutcome } from './GameOutcome'
import { HowToPlayModal } from './HowToPlay'
import { Loading } from './Loading'
import { OutcomeHistory } from './OutcomeHistory'
import { PlayerOneBoard, PlayerTwoBoard } from './PlayerBoard'
import { QRCodeModal } from './QRCode'
import { SideBarActions } from './SideBar'
import { WarningToast } from './WarningToast'

export function Game() {
  const gameStore = useGameWhileLoading()
  const isOnMobile = useIsOnMobile()
  const gameRef = React.useRef<React.ElementRef<'div'>>(null)
  useNoIndex()

  if (gameStore === null) {
    return <Loading />
  }

  const { errorMessage, clearErrorMessage } = gameStore

  return (
    <>
      <SideBarActions>
        <HowToPlayModal />
        <QRCodeModal />
        <OutcomeHistory />
        {isOnMobile && <GameOutcome />}
        <GameMode />
      </SideBarActions>
      <div ref={gameRef} className='flex flex-col items-center justify-around'>
        <PlayerTwoBoard />
        {!isOnMobile && <GameOutcome />}
        <PlayerOneBoard />
        <WarningToast message={errorMessage} onDismiss={clearErrorMessage} />
      </div>
    </>
  )
}
